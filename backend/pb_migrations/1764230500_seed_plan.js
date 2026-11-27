/// <reference path="../pb_data/types.d.ts" />

// Globale Übungen und die beiden Vorlagen aus dem Artefakt (Stand 27.11.2026).
// Die keys entsprechen den Übungs-IDs im Artefakt, damit der Import passt.

const EXERCISES = [
  ["warm", "Crosstrainer, Rad oder Laufband, locker", "cardio", "Aufwärmen, Puls langsam hochfahren"],
  ["ar", "Kabel-Außenrotation", "schulter", "1 × 15 je Seite, Kabel auf Ellbogenhöhe, Ellbogen am Körper"],
  ["pa", "Pull-Aparts am Kabelzug", "schulter", "1 × 15, beide Kabel auf Brusthöhe, Griffe gekreuzt"],
  ["fp", "Face Pulls am Kabel", "schulter", "1 × 15, Seil auf Stirnhöhe"],
  ["bp", "Beinpresse", "kraft", "Knie in Linie mit den Füßen"],
  ["lz", "Latzug, enger neutraler Griff", "kraft", "Nur vor dem Kopf ziehen, nie in den Nacken"],
  ["br", "Brustpresse Maschine, neutraler Griff", "kraft", "Ellbogen ca. 45°, Griffe nicht hinter die Körperlinie"],
  ["ru", "Rudern am Kabel, neutral", "kraft", "Schulterblätter zuerst zurückziehen"],
  ["bi", "Bizeps-Curls am Kabel", "kraft", "Ellbogen ruhig am Körper"],
  ["tr", "Trizeps-Pushdown am Kabel", "kraft", "Oberarme bleiben ruhig"],
  ["hy", "Hyperextension", "kraft", "Langsam, oben nicht ins Hohlkreuz"],
  ["z2", "Rad, Crosstrainer oder Laufband mit Steigung", "cardio", "Zone 2: Du kannst noch in ganzen Sätzen reden"],
];

const prep = { id: "prep", name: "Schulter-Vorbereitung", minutes: 4,
  hint: "Alles am Kabelzug, sehr leichtes Gewicht.",
  items: [{ exercise: "ar", sets: 1, reps: "15" }, { exercise: "pa", sets: 1, reps: "15" }, { exercise: "fp", sets: 1, reps: "15" }] };
const warm = { id: "warm", name: "Aufwärmen", minutes: 10, hint: "Puls langsam hochfahren, locker bleiben.",
  items: [{ exercise: "warm", seconds: 600 }] };

const TEMPLATES = [
  {
    key: "gk", name: "Ganzkörper · Krafttag", kind: "kraft", sort: 1,
    phases: [
      { key: "a", label: "Woche 1–2", sets: 2, kraft_min: 22, cardio_min: 28 },
      { key: "b", label: "Ab Woche 3", sets: 3, kraft_min: 30, cardio_min: 20 },
    ],
    blocks: [
      warm, prep,
      { id: "kraft", name: "Kraft", minutes: "phase.kraft_min",
        hint: "Supersätze: Übung 1 → direkt Übung 2 → Pause → wieder von vorn.",
        items: [
          { exercise: "bp", group: "A", sets: "phase.sets", reps: "12–15" },
          { exercise: "lz", group: "A", sets: "phase.sets", reps: "12–15", rest: 75 },
          { exercise: "br", group: "B", sets: "phase.sets", reps: "12–15" },
          { exercise: "ru", group: "B", sets: "phase.sets", reps: "12–15", rest: 75 },
          { exercise: "bi", group: "C", sets: "phase.sets", reps: "12–15" },
          { exercise: "tr", group: "C", sets: "phase.sets", reps: "12–15", rest: 60 },
          { exercise: "hy", group: "D", sets: "phase.sets", reps: "12", rest: 60 },
        ] },
      { id: "cardio", name: "Ausdauer", minutes: "phase.cardio_min", hint: "Zone 2, gleichmäßiges Tempo.",
        items: [{ exercise: "z2", seconds: "phase.cardio_min*60" }] },
    ],
  },
  {
    key: "mi", name: "Mittwoch · Ausdauer", kind: "ausdauer", sort: 2, phases: [],
    blocks: [
      warm, prep,
      { id: "cardio", name: "Ausdauer", minutes: 45, hint: "Zone 2. Nach der Hälfte darfst du das Gerät wechseln.",
        items: [{ exercise: "z2", seconds: 2700 }] },
    ],
  },
];

migrate((app) => {
  const ex = app.findCollectionByNameOrId("exercises");
  for (const [key, name, kind, hint] of EXERCISES) {
    const r = new Record(ex);
    r.set("key", key); r.set("name", name); r.set("kind", kind); r.set("hint", hint);
    app.save(r);
  }
  const tpl = app.findCollectionByNameOrId("templates");
  for (const t of TEMPLATES) {
    const r = new Record(tpl);
    for (const [k, v] of Object.entries(t)) r.set(k, v);
    app.save(r);
  }
}, (app) => {
  for (const t of TEMPLATES) {
    try { app.delete(app.findFirstRecordByData("templates", "key", t.key)); } catch (_) {}
  }
  for (const [key] of EXERCISES) {
    try { app.delete(app.findFirstRecordByData("exercises", "key", key)); } catch (_) {}
  }
});
