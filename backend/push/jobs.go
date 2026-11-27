package push

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Pausen- und Timer-Meldungen sind nach dieser Zeit wertlos (z. B. nach einem Neustart).
const staleAfter = 10 * time.Minute

var clientKinds = map[string]bool{"rest": true, "timer": true, "upload": true}

func dt(t time.Time) string {
	d, _ := types.ParseDateTime(t.UTC())
	return d.String()
}

// Schedule legt einen Job an und ersetzt einen offenen Job desselben Nutzers mit gleicher ref.
func (s *Service) Schedule(userID, kind, ref string, fireAt time.Time, m Message) (*core.Record, error) {
	if err := s.Cancel(userID, ref, false); err != nil {
		return nil, err
	}
	col, err := s.app.FindCollectionByNameOrId("push_jobs")
	if err != nil {
		return nil, err
	}
	rec := core.NewRecord(col)
	rec.Set("user", userID)
	rec.Set("kind", kind)
	rec.Set("ref", ref)
	rec.Set("fire_at", fireAt.UTC())
	rec.Set("title", m.Title)
	rec.Set("body", m.Body)
	rec.Set("url", m.URL)
	return rec, s.app.Save(rec)
}

// Cancel storniert offene Jobs mit genau dieser ref oder (prefix) mit diesem Anfang.
func (s *Service) Cancel(userID, ref string, prefix bool) error {
	open, err := s.app.FindRecordsByFilter("push_jobs", "user = {:u} && sent = '' && cancelled = false", "", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		return err
	}
	for _, j := range open {
		r := j.GetString("ref")
		if r == ref || (prefix && ref != "" && strings.HasPrefix(r, ref)) {
			j.Set("cancelled", true)
			if err := s.app.Save(j); err != nil {
				return err
			}
		}
	}
	return nil
}

// RunDue verschickt alle fälligen Jobs.
func (s *Service) RunDue(ctx context.Context) error {
	now := s.Now()
	due, err := s.app.FindRecordsByFilter("push_jobs", "sent = '' && cancelled = false && fire_at <= {:now}", "fire_at", 100, 0, dbx.Params{"now": dt(now)})
	if err != nil {
		return err
	}
	for _, j := range due {
		s.runJob(ctx, j, now)
	}
	return nil
}

func (s *Service) runJob(ctx context.Context, j *core.Record, now time.Time) {
	finish := func(cancelled bool, msg string) {
		if cancelled {
			j.Set("cancelled", true)
		} else {
			j.Set("sent", now.UTC())
		}
		j.Set("error", msg)
		_ = s.app.Save(j)
	}
	kind := j.GetString("kind")
	userID := j.GetString("user")
	user, err := s.app.FindRecordById("users", userID)
	if err != nil {
		finish(true, "Nutzer fehlt")
		return
	}
	set := userSettings(user)
	switch kind {
	case "rest", "timer":
		if !set.Rest {
			finish(true, "abgeschaltet")
			return
		}
		if now.Sub(j.GetDateTime("fire_at").Time()) > staleAfter {
			finish(true, "zu spät")
			return
		}
	case "upload":
		if !set.Upload {
			finish(true, "abgeschaltet")
			return
		}
		uploaded, err := s.sessionExists(userID, strings.TrimPrefix(j.GetString("ref"), "upload|"))
		if err != nil {
			finish(false, err.Error())
			return
		}
		if uploaded {
			finish(true, "hochgeladen")
			return
		}
	}
	_, err = s.SendToUser(ctx, userID, Message{Title: j.GetString("title"), Body: j.GetString("body"), URL: j.GetString("url"), Tag: kind})
	if err != nil {
		finish(false, err.Error())
		return
	}
	finish(false, "")
}

func (s *Service) sessionExists(userID, startedISO string) (bool, error) {
	started, err := types.ParseDateTime(startedISO)
	if err != nil || started.IsZero() {
		return false, nil
	}
	_, err = s.app.FindFirstRecordByFilter("sessions", "user = {:u} && started = {:s}", dbx.Params{"u": userID, "s": started.String()})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Service) worker(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.RunDue(ctx); err != nil {
				s.app.Logger().Error("push: Worker", "error", err)
			}
		}
	}
}
