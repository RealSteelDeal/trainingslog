package push

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func (s *Service) routes(se *core.ServeEvent) {
	g := se.Router.Group("/api/push")
	g.GET("/key", s.handleKey)
	auth := g.Group("")
	auth.Bind(apis.RequireAuth("users"))
	auth.POST("/subscribe", s.handleSubscribe)
	auth.POST("/unsubscribe", s.handleUnsubscribe)
	auth.POST("/test", s.handleTest)
	auth.POST("/schedule", s.handleSchedule)
	auth.POST("/cancel", s.handleCancel)
}

func (s *Service) handleKey(e *core.RequestEvent) error {
	keys, err := s.VAPIDKeys()
	if err != nil {
		return e.InternalServerError("Schlüssel nicht verfügbar", err)
	}
	return e.JSON(http.StatusOK, map[string]string{"publicKey": keys.Public})
}

func validOrigin(o string) bool {
	u, err := url.Parse(o)
	if err != nil || u.Host == "" || u.Path != "" && u.Path != "/" {
		return false
	}
	return u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))
}

func (s *Service) handleSubscribe(e *core.RequestEvent) error {
	var in struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		Origin string `json:"origin"`
		UA     string `json:"ua"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Ungültige Anfrage", err)
	}
	if !strings.HasPrefix(in.Endpoint, "https://") || in.Keys.P256dh == "" || in.Keys.Auth == "" || !validOrigin(in.Origin) {
		return e.BadRequestError("Abo unvollständig", nil)
	}
	rec, err := s.app.FindFirstRecordByFilter("push_subscriptions", "endpoint = {:e}", dbx.Params{"e": in.Endpoint})
	if errors.Is(err, sql.ErrNoRows) {
		col, cerr := s.app.FindCollectionByNameOrId("push_subscriptions")
		if cerr != nil {
			return e.InternalServerError("", cerr)
		}
		rec = core.NewRecord(col)
	} else if err != nil {
		return e.InternalServerError("", err)
	}
	rec.Set("user", e.Auth.Id)
	rec.Set("endpoint", in.Endpoint)
	rec.Set("p256dh", in.Keys.P256dh)
	rec.Set("auth", in.Keys.Auth)
	rec.Set("origin", strings.TrimRight(in.Origin, "/"))
	if len(in.UA) > 300 {
		in.UA = in.UA[:300]
	}
	rec.Set("ua", in.UA)
	rec.Set("failures", 0)
	if err := s.app.Save(rec); err != nil {
		return e.BadRequestError("Abo konnte nicht gespeichert werden", err)
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func (s *Service) handleUnsubscribe(e *core.RequestEvent) error {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Ungültige Anfrage", err)
	}
	rec, err := s.app.FindFirstRecordByFilter("push_subscriptions", "endpoint = {:e} && user = {:u}", dbx.Params{"e": in.Endpoint, "u": e.Auth.Id})
	if err == nil {
		_ = s.app.Delete(rec)
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}

func (s *Service) handleTest(e *core.RequestEvent) error {
	n, err := s.SendToUser(e.Request.Context(), e.Auth.Id, Message{
		Title: "Benachrichtigungen funktionieren",
		Body:  "So sieht eine Meldung vom Trainingslog aus.",
		URL:   "/einstellungen",
		Tag:   "test",
	})
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	return e.JSON(http.StatusOK, map[string]int{"sent": n})
}

func (s *Service) handleSchedule(e *core.RequestEvent) error {
	var in struct {
		Kind   string    `json:"kind"`
		Ref    string    `json:"ref"`
		FireAt time.Time `json:"fireAt"`
		Title  string    `json:"title"`
		Body   string    `json:"body"`
		URL    string    `json:"url"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Ungültige Anfrage", err)
	}
	now := s.Now()
	switch {
	case !clientKinds[in.Kind]:
		return e.BadRequestError("Unbekannte Art", nil)
	case in.Ref == "" || len(in.Ref) > 200:
		return e.BadRequestError("ref fehlt", nil)
	case in.FireAt.Before(now.Add(-time.Minute)) || in.FireAt.After(now.Add(48*time.Hour)):
		return e.BadRequestError("Zeitpunkt außerhalb des erlaubten Bereichs", nil)
	case in.Title == "" || len(in.Title) > 200 || len(in.Body) > 500 || !strings.HasPrefix(in.URL, "/") || len(in.URL) > 200:
		return e.BadRequestError("Text oder Ziel ungültig", nil)
	}
	rec, err := s.Schedule(e.Auth.Id, in.Kind, in.Ref, in.FireAt, Message{Title: in.Title, Body: in.Body, URL: in.URL})
	if err != nil {
		return e.InternalServerError("", err)
	}
	// Bereits fällige Jobs nicht erst beim nächsten Worker-Takt verschicken.
	if !in.FireAt.After(now) {
		go func() { _ = s.RunDue(context.Background()) }()
	}
	return e.JSON(http.StatusOK, map[string]string{"id": rec.Id})
}

func (s *Service) handleCancel(e *core.RequestEvent) error {
	var in struct {
		Ref    string `json:"ref"`
		Prefix bool   `json:"prefix"`
	}
	if err := e.BindBody(&in); err != nil || in.Ref == "" {
		return e.BadRequestError("ref fehlt", err)
	}
	if err := s.Cancel(e.Auth.Id, in.Ref, in.Prefix); err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(http.StatusOK, map[string]bool{"ok": true})
}
