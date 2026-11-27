// Package push versendet Web-Push-Benachrichtigungen (VAPID) für den Trainingslog:
// Pausen- und Timer-Ende, Trainingserinnerungen, Upload-Hinweis, Wochenrückblick.
package push

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Message ist der Inhalt einer Benachrichtigung; URL ist ein Pfad der App.
type Message struct {
	Title string
	Body  string
	URL   string
	Tag   string
}

// Target ist ein Abo eines Geräts.
type Target struct {
	Endpoint string
	P256dh   string
	Auth     string
	Origin   string
}

// Sender stellt eine Nachricht zu und liefert den HTTP-Status des Push-Dienstes.
type Sender func(ctx context.Context, t Target, payload []byte, keys Keys) (int, error)

type Keys struct {
	Public  string
	Private string
}

type Service struct {
	app  core.App
	Send Sender
	Now  func() time.Time

	mu   sync.Mutex
	keys *Keys
}

func New(app core.App) *Service {
	return &Service{app: app, Send: webpushSender, Now: time.Now}
}

// Register hängt Routen, Worker und Zeitplan an die App.
func Register(app core.App) *Service {
	s := New(app)
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		s.routes(e)
		ctx, cancel := context.WithCancel(context.Background())
		go s.worker(ctx, 2*time.Second)
		app.OnTerminate().BindFunc(func(te *core.TerminateEvent) error {
			cancel()
			return te.Next()
		})
		return e.Next()
	})
	app.Cron().MustAdd("push_schedule", "* * * * *", func() {
		if err := s.RunScheduled(s.Now()); err != nil {
			app.Logger().Error("push: Zeitplan", "error", err)
		}
	})
	return s
}

// VAPIDKeys liefert das Schlüsselpaar: aus der Umgebung oder aus push_keys,
// beim ersten Bedarf automatisch erzeugt und gespeichert.
func (s *Service) VAPIDKeys() (Keys, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.keys != nil {
		return *s.keys, nil
	}
	if pub, priv := os.Getenv("VAPID_PUBLIC_KEY"), os.Getenv("VAPID_PRIVATE_KEY"); pub != "" && priv != "" {
		s.keys = &Keys{Public: pub, Private: priv}
		return *s.keys, nil
	}
	if rec, err := s.app.FindFirstRecordByFilter("push_keys", ""); err == nil {
		s.keys = &Keys{Public: rec.GetString("public"), Private: rec.GetString("private")}
		return *s.keys, nil
	}
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return Keys{}, err
	}
	col, err := s.app.FindCollectionByNameOrId("push_keys")
	if err != nil {
		return Keys{}, err
	}
	rec := core.NewRecord(col)
	rec.Set("public", pub)
	rec.Set("private", priv)
	if err := s.app.Save(rec); err != nil {
		return Keys{}, err
	}
	s.keys = &Keys{Public: pub, Private: priv}
	return *s.keys, nil
}

// Payload im Format von Declarative Web Push (iOS ab 18.4). Ältere Browser
// erhalten dieselben Daten und zeigen sie über den Service Worker an.
func Payload(m Message, origin string) []byte {
	n := map[string]any{
		"title":    m.Title,
		"body":     m.Body,
		"navigate": strings.TrimRight(origin, "/") + "/" + strings.TrimLeft(m.URL, "/"),
		"lang":     "de-AT",
	}
	if m.Tag != "" {
		n["tag"] = m.Tag
	}
	b, _ := json.Marshal(map[string]any{"web_push": 8030, "notification": n})
	return b
}

func webpushSender(ctx context.Context, t Target, payload []byte, keys Keys) (int, error) {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: t.Endpoint,
		Keys:     webpush.Keys{P256dh: t.P256dh, Auth: t.Auth},
	}, &webpush.Options{
		Subscriber:      t.Origin,
		VAPIDPublicKey:  keys.Public,
		VAPIDPrivateKey: keys.Private,
		TTL:             600,
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// SendToUser stellt eine Nachricht an alle Geräte eines Nutzers zu.
// Abgelaufene Abos (404/410) werden gelöscht. Liefert die Zahl erfolgreicher Zustellungen.
func (s *Service) SendToUser(ctx context.Context, userID string, m Message) (int, error) {
	keys, err := s.VAPIDKeys()
	if err != nil {
		return 0, err
	}
	subs, err := s.app.FindAllRecords("push_subscriptions", dbx.HashExp{"user": userID})
	if err != nil {
		return 0, err
	}
	if len(subs) == 0 {
		return 0, errors.New("kein Gerät angemeldet")
	}
	ok := 0
	var lastErr error
	for _, sub := range subs {
		t := Target{Endpoint: sub.GetString("endpoint"), P256dh: sub.GetString("p256dh"), Auth: sub.GetString("auth"), Origin: sub.GetString("origin")}
		sctx, cancel := context.WithTimeout(ctx, 15*time.Second)
		status, err := s.Send(sctx, t, Payload(m, t.Origin), keys)
		cancel()
		switch {
		case status == http.StatusNotFound || status == http.StatusGone:
			_ = s.app.Delete(sub)
		case err == nil && status >= 200 && status < 300:
			ok++
			if sub.GetInt("failures") != 0 {
				sub.Set("failures", 0)
				_ = s.app.Save(sub)
			}
		default:
			if err == nil {
				err = errors.New("Push-Dienst antwortet " + http.StatusText(status))
			}
			lastErr = err
			sub.Set("failures", sub.GetInt("failures")+1)
			_ = s.app.Save(sub)
		}
	}
	if ok == 0 && lastErr != nil {
		return 0, lastErr
	}
	return ok, nil
}
