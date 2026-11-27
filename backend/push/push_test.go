package push

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

var testApp core.App

// Eine App für alle Tests: echte SQLite-Datenbank mit allen JS-Migrationen des Projekts.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "pbpush")
	if err != nil {
		panic(err)
	}
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dir})
	jsvm.MustRegister(app, jsvm.Config{MigrationsDir: "../pb_migrations"})
	if err := app.Bootstrap(); err != nil {
		panic(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		panic(err)
	}
	testApp = app
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

var vienna, _ = time.LoadLocation("Europe/Vienna")

type sent struct {
	endpoint string
	payload  map[string]any
}

type fake struct {
	mu     sync.Mutex
	status map[string]int
	out    []sent
}

func (f *fake) send(_ context.Context, t Target, payload []byte, _ Keys) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var p map[string]any
	_ = json.Unmarshal(payload, &p)
	f.out = append(f.out, sent{t.Endpoint, p})
	if st, ok := f.status[t.Endpoint]; ok {
		return st, nil
	}
	return http.StatusCreated, nil
}

func (f *fake) titles() []string {
	var out []string
	for _, s := range f.out {
		out = append(out, s.payload["notification"].(map[string]any)["title"].(string))
	}
	return out
}

func setup(t *testing.T, now time.Time) (*Service, *fake) {
	t.Helper()
	for _, c := range []string{"push_jobs", "push_subscriptions", "cardio_logs", "set_logs", "sessions", "users"} {
		if _, err := testApp.DB().NewQuery("DELETE FROM " + c).Execute(); err != nil {
			t.Fatal(err)
		}
	}
	f := &fake{status: map[string]int{}}
	s := New(testApp)
	s.Send = f.send
	s.Now = func() time.Time { return now }
	return s, f
}

func save(t *testing.T, col string, data map[string]any) *core.Record {
	t.Helper()
	c, err := testApp.FindCollectionByNameOrId(col)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	for k, v := range data {
		r.Set(k, v)
	}
	if err := testApp.Save(r); err != nil {
		t.Fatalf("%s: %v", col, err)
	}
	return r
}

var userN int

func newUser(t *testing.T, notify any, devices ...string) *core.Record {
	t.Helper()
	userN++
	data := map[string]any{"email": fmt.Sprintf("u%d@example.com", userN), "password": "geheim-12345", "passwordConfirm": "geheim-12345"}
	if notify != nil {
		data["notify"] = notify
	}
	u := save(t, "users", data)
	for _, d := range devices {
		save(t, "push_subscriptions", map[string]any{"user": u.Id, "endpoint": "https://push.example/" + d, "p256dh": "p", "auth": "a", "origin": "https://training.example"})
	}
	return u
}

func openJobs(t *testing.T, userID string) []*core.Record {
	t.Helper()
	list, err := testApp.FindRecordsByFilter("push_jobs", "user = {:u} && sent = '' && cancelled = false", "ref", 0, 0, dbx.Params{"u": userID})
	if err != nil {
		t.Fatal(err)
	}
	return list
}

func TestParseSettings(t *testing.T) {
	d := ParseSettings(nil)
	if !d.Rest || !d.Reminder || !d.Upload || !d.Weekly || d.TZ != "Europe/Vienna" || len(d.Plan) != 3 {
		t.Fatalf("Standard falsch: %+v", d)
	}
	if d.Plan[0] != (PlanDay{1, "16:00", "kraft"}) || d.Plan[1] != (PlanDay{3, "08:00", "ausdauer"}) || d.Plan[2] != (PlanDay{5, "16:00", "kraft"}) {
		t.Fatalf("Standardplan falsch: %+v", d.Plan)
	}
	s := ParseSettings([]byte(`{"rest":false,"tz":"Mars/Olympus","plan":[{"day":2,"time":"18:30","kind":"kraft"},{"day":9,"time":"18:00","kind":"kraft"},{"day":4,"time":"25:00","kind":"kraft"},{"day":6,"time":"09:00","kind":"yoga"}]}`))
	if s.Rest || !s.Weekly || s.TZ != "Europe/Vienna" || len(s.Plan) != 1 || s.Plan[0].Day != 2 {
		t.Fatalf("Eingaben falsch übernommen: %+v", s)
	}
	if e := ParseSettings([]byte(`{"plan":[]}`)); len(e.Plan) != 0 {
		t.Fatal("leerer Plan muss leer bleiben")
	}
}

func TestPayload(t *testing.T) {
	var p map[string]any
	_ = json.Unmarshal(Payload(Message{Title: "Pause vorbei", Body: "Weiter", URL: "/einheit", Tag: "rest"}, "https://training.example/"), &p)
	n := p["notification"].(map[string]any)
	if p["web_push"].(float64) != 8030 || n["navigate"] != "https://training.example/einheit" || n["title"] != "Pause vorbei" || n["tag"] != "rest" {
		t.Fatalf("Payload falsch: %v", p)
	}
	if _, ok := p["app_badge"]; ok {
		t.Fatal("app_badge führt in Safari zu Abstürzen und darf nicht gesetzt sein")
	}
}

func TestVAPIDKeysAreStable(t *testing.T) {
	a, err := New(testApp).VAPIDKeys()
	if err != nil || a.Public == "" || a.Private == "" {
		t.Fatal(err)
	}
	b, _ := New(testApp).VAPIDKeys()
	if a != b {
		t.Fatal("zweite Instanz muss die gespeicherten Schlüssel verwenden")
	}
}

func TestScheduleReplacesAndCancels(t *testing.T) {
	now := time.Date(2026, 11, 30, 17, 0, 0, 0, vienna)
	s, _ := setup(t, now)
	u := newUser(t, nil, "a")
	msg := Message{Title: "Pause vorbei", URL: "/einheit"}
	s.Schedule(u.Id, "rest", "2026-11-30T16:00:00Z|rest", now.Add(time.Minute), msg)
	s.Schedule(u.Id, "rest", "2026-11-30T16:00:00Z|rest", now.Add(2*time.Minute), msg)
	s.Schedule(u.Id, "timer", "2026-11-30T16:00:00Z|timer|warm", now.Add(10*time.Minute), msg)
	s.Schedule(u.Id, "upload", "upload|2026-11-30T16:00:00Z", now.Add(12*time.Hour), msg)
	if n := len(openJobs(t, u.Id)); n != 3 {
		t.Fatalf("gleiche ref muss ersetzen: %d offene Jobs", n)
	}
	if err := s.Cancel(u.Id, "2026-11-30T16:00:00Z|", true); err != nil {
		t.Fatal(err)
	}
	open := openJobs(t, u.Id)
	if len(open) != 1 || open[0].GetString("kind") != "upload" {
		t.Fatalf("Präfix-Storno trifft nur Pause und Timer: %d", len(open))
	}
}

func TestRunDue(t *testing.T) {
	now := time.Date(2026, 11, 30, 17, 0, 0, 0, vienna)
	s, f := setup(t, now)
	u := newUser(t, nil, "a", "weg")
	f.status["https://push.example/weg"] = http.StatusGone
	s.Schedule(u.Id, "rest", "r1", now.Add(-5*time.Second), Message{Title: "Pause vorbei", URL: "/einheit"})
	s.Schedule(u.Id, "timer", "t1", now.Add(time.Minute), Message{Title: "Später", URL: "/einheit"})
	s.Schedule(u.Id, "rest", "alt", now.Add(-time.Hour), Message{Title: "Zu alt", URL: "/einheit"})
	if err := s.RunDue(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(f.titles(), ","); got != "Pause vorbei,Pause vorbei" {
		t.Fatalf("gesendet: %s", got)
	}
	if subs, _ := testApp.FindAllRecords("push_subscriptions", dbx.HashExp{"user": u.Id}); len(subs) != 1 {
		t.Fatalf("abgelaufenes Abo (410) muss gelöscht sein, übrig: %d", len(subs))
	}
	old, _ := testApp.FindFirstRecordByFilter("push_jobs", "ref = 'alt'")
	if !old.GetBool("cancelled") || old.GetString("error") != "zu spät" {
		t.Fatal("veraltete Pausen-Meldung muss verworfen werden")
	}
	if len(openJobs(t, u.Id)) != 1 {
		t.Fatal("zukünftiger Job muss offen bleiben")
	}
}

func TestRestSwitchedOff(t *testing.T) {
	now := time.Date(2026, 11, 30, 17, 0, 0, 0, vienna)
	s, f := setup(t, now)
	u := newUser(t, map[string]any{"rest": false}, "a")
	s.Schedule(u.Id, "rest", "r1", now, Message{Title: "Pause vorbei", URL: "/einheit"})
	s.RunDue(context.Background())
	if len(f.out) != 0 {
		t.Fatal("abgeschaltete Pausen-Meldung darf nicht gesendet werden")
	}
}

func TestUploadHint(t *testing.T) {
	started := time.Date(2026, 11, 30, 16, 0, 0, 0, vienna)
	now := started.Add(12 * time.Hour)
	s, f := setup(t, now)
	u := newUser(t, nil, "a")
	other := started.Add(-48 * time.Hour)
	save(t, "sessions", map[string]any{"user": u.Id, "kind": "kraft", "started": started.UTC()})
	s.Schedule(u.Id, "upload", "upload|"+started.UTC().Format(time.RFC3339Nano), now, Message{Title: "Hochgeladen?", URL: "/"})
	s.Schedule(u.Id, "upload", "upload|"+other.UTC().Format("2006-01-02T15:04:05.000Z"), now, Message{Title: "Nicht hochgeladen", URL: "/"})
	s.RunDue(context.Background())
	if got := strings.Join(f.titles(), ","); got != "Nicht hochgeladen" {
		t.Fatalf("nur die fehlende Einheit meldet sich: %q", got)
	}
}

func TestReminders(t *testing.T) {
	mon16 := time.Date(2026, 11, 30, 16, 0, 0, 0, vienna)
	s, f := setup(t, mon16)
	newUser(t, nil, "a")
	busy := newUser(t, nil, "b")
	off := newUser(t, map[string]any{"reminder": false}, "c")
	newUser(t, nil) // ohne Gerät: wird übersprungen
	save(t, "sessions", map[string]any{"user": busy.Id, "kind": "kraft", "started": mon16.Add(-2 * time.Hour).UTC()})

	for i := 0; i < 2; i++ { // zweimal in derselben Minute: keine doppelte Erinnerung
		if err := s.RunScheduled(mon16); err != nil {
			t.Fatal(err)
		}
	}
	s.RunDue(context.Background())
	if got := strings.Join(f.titles(), ","); got != "Heute ist Krafttag" {
		t.Fatalf("Montag 16:00: %q", got)
	}
	if f.out[0].endpoint != "https://push.example/a" || f.out[0].payload["notification"].(map[string]any)["navigate"] != "https://training.example/" {
		t.Fatalf("falsches Ziel: %+v", f.out[0])
	}
	_ = off

	f.out = nil
	s.RunScheduled(mon16.Add(time.Minute))
	wed8 := time.Date(2026, 12, 2, 8, 0, 0, 0, vienna)
	s.Now = func() time.Time { return wed8 }
	s.RunScheduled(wed8)
	s.RunDue(context.Background())
	if got := strings.Join(f.titles(), ","); got != "Heute ist Ausdauertag,Heute ist Ausdauertag" {
		t.Fatalf("Mittwoch 08:00 an beide Nutzer ohne Einheit: %q", got)
	}
}

func TestCustomPlanAndTimezone(t *testing.T) {
	// Dienstag 18:30 in New York = Mittwoch 00:30 in Wien
	ny, _ := time.LoadLocation("America/New_York")
	tue := time.Date(2026, 12, 1, 18, 30, 0, 0, ny)
	s, f := setup(t, tue)
	newUser(t, map[string]any{"tz": "America/New_York", "plan": []map[string]any{{"day": 2, "time": "18:30", "kind": "kraft"}}}, "a")
	newUser(t, nil, "b") // Wiener Standardplan: nichts um 00:30
	s.RunScheduled(tue)
	s.RunDue(context.Background())
	if len(f.out) != 1 || f.out[0].endpoint != "https://push.example/a" {
		t.Fatalf("eigener Plan in eigener Zeitzone: %+v", f.out)
	}
}

func TestWeekly(t *testing.T) {
	sun19 := time.Date(2026, 11, 29, 19, 0, 0, 0, vienna)
	s, f := setup(t, sun19)
	u := newUser(t, nil, "a")
	u.Set("phase_log", []map[string]string{{"phase": "b", "from": "2026-11-23"}})
	testApp.Save(u)
	add := func(day int, kind string, shoulder int, zone2, warm float64) {
		st := time.Date(2026, 11, day, 17, 0, 0, 0, vienna)
		x := save(t, "sessions", map[string]any{"user": u.Id, "kind": kind, "started": st.UTC(), "shoulder": shoulder})
		if zone2 > 0 {
			save(t, "cardio_logs", map[string]any{"session": x.Id, "phase": "ausdauer", "minutes": zone2})
		}
		if warm > 0 {
			save(t, "cardio_logs", map[string]any{"session": x.Id, "phase": "aufwaermen", "minutes": warm})
		}
	}
	add(23, "kraft", 2, 20, 10)
	add(25, "ausdauer", 1, 45, 10)
	add(22, "kraft", 5, 28, 10) // Vorwoche
	s.RunScheduled(sun19)
	s.RunScheduled(sun19)
	s.RunDue(context.Background())
	if len(f.out) != 1 {
		t.Fatalf("genau ein Rückblick, gesendet: %d", len(f.out))
	}
	n := f.out[0].payload["notification"].(map[string]any)
	if n["title"] != "Wochenrückblick KW 48" || n["body"] != "Kraft 1/2 · Zone 2 65/40 min · Aufwärmen 20 min · Schulter Ø 1,5" {
		t.Fatalf("Rückblick: %v / %v", n["title"], n["body"])
	}
}

func TestWeekHelpers(t *testing.T) {
	// Ende der Sommerzeit: Sonntag 25.10.2026 23:30 gehört noch zur Woche ab 19.10.
	if ws := WeekStart(time.Date(2026, 10, 25, 23, 30, 0, 0, vienna)); ws.Day() != 19 || ws.Hour() != 0 {
		t.Fatalf("Wochenstart: %v", ws)
	}
	log := []byte(`[{"phase":"b","from":"2026-11-23"}]`)
	if PhaseAt(log, time.Date(2026, 11, 16, 0, 0, 0, 0, vienna)) != "a" || PhaseAt(log, time.Date(2026, 11, 23, 0, 0, 0, 0, vienna)) != "b" || PhaseAt(nil, time.Now()) != "a" {
		t.Fatal("Phase pro Woche falsch")
	}
	for in, want := range map[float64]string{20: "20", 100: "100", 1.5: "1,5", 2.04: "2", 0: "0"} {
		if got := fmtNum(in, 1); got != want {
			t.Fatalf("fmtNum(%v) = %q, erwartet %q", in, got, want)
		}
	}
	if m := WeeklyMessage(Week{Number: 2}); !strings.Contains(m.Body, "keine Einheit") {
		t.Fatalf("leere Woche: %s", m.Body)
	}
}
