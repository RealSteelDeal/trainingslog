package push

import (
	"encoding/json"
	"regexp"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// PlanDay ist ein geplanter Trainingstag: Wochentag (0 = Sonntag), Uhrzeit der Erinnerung, Art.
type PlanDay struct {
	Day  int    `json:"day"`
	Time string `json:"time"`
	Kind string `json:"kind"`
}

// Settings entspricht users.notify. Fehlende Werte fallen auf DefaultSettings zurück.
type Settings struct {
	TZ       string    `json:"tz"`
	Rest     bool      `json:"rest"`
	Reminder bool      `json:"reminder"`
	Upload   bool      `json:"upload"`
	Weekly   bool      `json:"weekly"`
	Plan     []PlanDay `json:"plan"`
}

// WeeklyAt ist der Zeitpunkt des Wochenrückblicks (Ortszeit).
const (
	WeeklyDay  = time.Sunday
	WeeklyTime = "19:00"
)

var DefaultSettings = Settings{
	TZ:       "Europe/Vienna",
	Rest:     true,
	Reminder: true,
	Upload:   true,
	Weekly:   true,
	Plan: []PlanDay{
		{Day: 1, Time: "16:00", Kind: "kraft"},
		{Day: 3, Time: "08:00", Kind: "ausdauer"},
		{Day: 5, Time: "16:00", Kind: "kraft"},
	},
}

var hhmm = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// ParseSettings liest users.notify; ungültige Einträge werden verworfen.
func ParseSettings(raw []byte) Settings {
	s := DefaultSettings
	s.Plan = append([]PlanDay(nil), DefaultSettings.Plan...)
	if len(raw) == 0 || string(raw) == "null" {
		return s
	}
	var in struct {
		TZ       *string    `json:"tz"`
		Rest     *bool      `json:"rest"`
		Reminder *bool      `json:"reminder"`
		Upload   *bool      `json:"upload"`
		Weekly   *bool      `json:"weekly"`
		Plan     *[]PlanDay `json:"plan"`
	}
	if json.Unmarshal(raw, &in) != nil {
		return s
	}
	if in.TZ != nil {
		if _, err := time.LoadLocation(*in.TZ); err == nil && *in.TZ != "" {
			s.TZ = *in.TZ
		}
	}
	for _, p := range []struct {
		src *bool
		dst *bool
	}{{in.Rest, &s.Rest}, {in.Reminder, &s.Reminder}, {in.Upload, &s.Upload}, {in.Weekly, &s.Weekly}} {
		if p.src != nil {
			*p.dst = *p.src
		}
	}
	if in.Plan != nil {
		s.Plan = nil
		for _, d := range *in.Plan {
			if d.Day >= 0 && d.Day <= 6 && hhmm.MatchString(d.Time) && (d.Kind == "kraft" || d.Kind == "ausdauer") {
				s.Plan = append(s.Plan, d)
			}
		}
	}
	return s
}

func (s Settings) Location() *time.Location {
	loc, err := time.LoadLocation(s.TZ)
	if err != nil {
		return time.UTC
	}
	return loc
}

func userSettings(u *core.Record) Settings {
	return ParseSettings([]byte(u.GetString("notify")))
}
