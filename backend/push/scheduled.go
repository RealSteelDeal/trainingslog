package push

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// RunScheduled läuft jede Minute: Trainingserinnerungen laut Plan und Wochenrückblick.
func (s *Service) RunScheduled(now time.Time) error {
	subs, err := s.app.FindAllRecords("push_subscriptions")
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	var errs []error
	for _, sub := range subs {
		uid := sub.GetString("user")
		if seen[uid] {
			continue
		}
		seen[uid] = true
		user, err := s.app.FindRecordById("users", uid)
		if err != nil {
			continue
		}
		set := userSettings(user)
		local := now.In(set.Location())
		hm := local.Format("15:04")
		if set.Reminder {
			for _, p := range set.Plan {
				if p.Day == int(local.Weekday()) && p.Time == hm {
					errs = append(errs, s.remind(user, p, local))
				}
			}
		}
		if set.Weekly && local.Weekday() == WeeklyDay && hm == WeeklyTime {
			errs = append(errs, s.weekly(user, local))
		}
	}
	return errors.Join(errs...)
}

func (s *Service) jobExists(userID, ref string) (bool, error) {
	_, err := s.app.FindFirstRecordByFilter("push_jobs", "user = {:u} && ref = {:r}", dbx.Params{"u": userID, "r": ref})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func dayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// ReminderMessage ist der Text der Trainingserinnerung.
func ReminderMessage(kind string) Message {
	if kind == "ausdauer" {
		return Message{Title: "Heute ist Ausdauertag", Body: "Optional: Zone 2 nach Plan. Tippen, um die Einheit zu starten.", URL: "/"}
	}
	return Message{Title: "Heute ist Krafttag", Body: "Noch keine Einheit erfasst. Tippen, um zu starten.", URL: "/"}
}

func (s *Service) remind(user *core.Record, p PlanDay, local time.Time) error {
	ref := "reminder|" + local.Format("2006-01-02") + "|" + p.Time
	if exists, err := s.jobExists(user.Id, ref); err != nil || exists {
		return err
	}
	from := dayStart(local)
	n, err := s.countSessions(user.Id, from, from.AddDate(0, 0, 1))
	if err != nil || n > 0 {
		return err
	}
	_, err = s.Schedule(user.Id, "reminder", ref, local, ReminderMessage(p.Kind))
	return err
}

func (s *Service) countSessions(userID string, from, to time.Time) (int, error) {
	list, err := s.app.FindRecordsByFilter("sessions", "user = {:u} && started >= {:a} && started < {:b}", "", 0, 0,
		dbx.Params{"u": userID, "a": dt(from), "b": dt(to)})
	return len(list), err
}

// Week fasst eine Trainingswoche für den Wochenrückblick zusammen.
type Week struct {
	Number   int
	Kraft    int
	Sessions int
	Zone2    float64
	Warm     float64
	Soll     int
	Shoulder float64 // Durchschnitt; -1 ohne Einheit
}

func fmtNum(v float64, digits int) string {
	p := math.Pow(10, float64(digits))
	v = math.Round(v*p) / p
	s := fmt.Sprintf("%.*f", digits, v)
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	return strings.Replace(s, ".", ",", 1)
}

// WeeklyMessage ist der Text des Wochenrückblicks.
func WeeklyMessage(w Week) Message {
	m := Message{Title: fmt.Sprintf("Wochenrückblick KW %d", w.Number), URL: "/auswertung"}
	if w.Sessions == 0 {
		m.Body = "Diese Woche keine Einheit erfasst. Neue Woche, neuer Anlauf."
		return m
	}
	m.Body = fmt.Sprintf("Kraft %d/2 · Zone 2 %s/%d min · Aufwärmen %s min · Schulter Ø %s",
		w.Kraft, fmtNum(w.Zone2, 0), w.Soll, fmtNum(w.Warm, 0), fmtNum(w.Shoulder, 1))
	return m
}

// PhaseAt liefert die Phase, die am Montag weekStart galt (users.phase_log); vor dem ersten Wechsel "a".
func PhaseAt(raw []byte, weekStart time.Time) string {
	var log []struct {
		Phase string `json:"phase"`
		From  string `json:"from"`
	}
	_ = json.Unmarshal(raw, &log)
	sort.Slice(log, func(i, j int) bool { return log[i].From < log[j].From })
	key := weekStart.Format("2006-01-02")
	phase := "a"
	for _, e := range log {
		if e.From <= key && e.Phase != "" {
			phase = e.Phase
		}
	}
	return phase
}

// WeekStart ist Montag 0:00 Ortszeit der Woche von t.
func WeekStart(t time.Time) time.Time {
	d := dayStart(t)
	return d.AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
}

func (s *Service) cardioSoll(phase string) int {
	tpls, err := s.app.FindAllRecords("templates", dbx.HashExp{"kind": "kraft"})
	if err != nil {
		return 0
	}
	for _, t := range tpls {
		var phases []struct {
			Key       string  `json:"key"`
			CardioMin float64 `json:"cardio_min"`
		}
		if json.Unmarshal([]byte(t.GetString("phases")), &phases) != nil || len(phases) == 0 {
			continue
		}
		for _, p := range phases {
			if p.Key == phase {
				return int(2 * p.CardioMin)
			}
		}
		return int(2 * phases[0].CardioMin)
	}
	return 0
}

// SummarizeWeek berechnet die Woche, in der local liegt (Ortszeit), wie die Auswertung der App.
func (s *Service) SummarizeWeek(user *core.Record, local time.Time) (Week, error) {
	from := WeekStart(local)
	to := from.AddDate(0, 0, 7)
	_, num := from.ISOWeek()
	w := Week{Number: num, Shoulder: -1, Soll: s.cardioSoll(PhaseAt([]byte(user.GetString("phase_log")), from))}
	sessions, err := s.app.FindRecordsByFilter("sessions", "user = {:u} && started >= {:a} && started < {:b}", "", 0, 0,
		dbx.Params{"u": user.Id, "a": dt(from), "b": dt(to)})
	if err != nil {
		return w, err
	}
	w.Sessions = len(sessions)
	sum := 0.0
	for _, x := range sessions {
		if x.GetString("kind") == "kraft" {
			w.Kraft++
		}
		sum += x.GetFloat("shoulder")
	}
	if w.Sessions > 0 {
		w.Shoulder = sum / float64(w.Sessions)
	}
	cardio, err := s.app.FindRecordsByFilter("cardio_logs", "session.user = {:u} && session.started >= {:a} && session.started < {:b}", "", 0, 0,
		dbx.Params{"u": user.Id, "a": dt(from), "b": dt(to)})
	if err != nil {
		return w, err
	}
	for _, c := range cardio {
		switch c.GetString("phase") {
		case "ausdauer":
			w.Zone2 += c.GetFloat("minutes")
		case "aufwaermen":
			w.Warm += c.GetFloat("minutes")
		}
	}
	return w, nil
}

func (s *Service) weekly(user *core.Record, local time.Time) error {
	_, num := WeekStart(local).ISOWeek()
	year, _ := WeekStart(local).ISOWeek()
	ref := fmt.Sprintf("weekly|%d-W%02d", year, num)
	if exists, err := s.jobExists(user.Id, ref); err != nil || exists {
		return err
	}
	w, err := s.SummarizeWeek(user, local)
	if err != nil {
		return err
	}
	_, err = s.Schedule(user.Id, "weekly", ref, local, WeeklyMessage(w))
	return err
}
