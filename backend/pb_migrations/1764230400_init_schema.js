/// <reference path="../pb_data/types.d.ts" />

// Grundschema: Übungen, Vorlagen, Einheiten, Sätze, Cardio.
// Mehrbenutzerfähig: jede Einheit gehört einem User; Übungen und Vorlagen
// ohne User sind global (für alle sichtbar, nur vom Superuser änderbar).

migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const authed = '@request.auth.id != ""';
  const own = `${authed} && user = @request.auth.id`;
  const globalOrOwn = `${authed} && (user = "" || user = @request.auth.id)`;
  const ts = [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  const exercises = new Collection({
    type: "base",
    name: "exercises",
    listRule: globalOrOwn,
    viewRule: globalOrOwn,
    createRule: own,
    updateRule: own,
    deleteRule: own,
    fields: [
      { type: "text", name: "key", max: 40 },
      { type: "text", name: "name", required: true, max: 120 },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["kraft", "cardio", "schulter"] },
      { type: "text", name: "hint", max: 300 },
      { type: "relation", name: "user", collectionId: usersId, maxSelect: 1, cascadeDelete: true },
      ...ts,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_exercises_key ON exercises (key) WHERE key != ''"],
  });
  app.save(exercises);

  // blocks: [{ id, name, minutes, hint, items: [{ exercise: key, group, sets, reps, rest, seconds }] }]
  const templates = new Collection({
    type: "base",
    name: "templates",
    listRule: globalOrOwn,
    viewRule: globalOrOwn,
    createRule: own,
    updateRule: own,
    deleteRule: own,
    fields: [
      { type: "text", name: "key", max: 40 },
      { type: "text", name: "name", required: true, max: 120 },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["kraft", "ausdauer"] },
      { type: "number", name: "sort", onlyInt: true },
      { type: "json", name: "phases", maxSize: 20000 },
      { type: "json", name: "blocks", required: true, maxSize: 200000 },
      { type: "relation", name: "user", collectionId: usersId, maxSelect: 1, cascadeDelete: true },
      ...ts,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_templates_key ON templates (key) WHERE key != ''"],
  });
  app.save(templates);

  const sessions = new Collection({
    type: "base",
    name: "sessions",
    listRule: own,
    viewRule: own,
    createRule: own,
    updateRule: own,
    deleteRule: own,
    fields: [
      { type: "relation", name: "user", collectionId: usersId, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "relation", name: "template", collectionId: templates.id, maxSelect: 1 },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["kraft", "ausdauer"] },
      { type: "text", name: "phase", max: 10 },
      { type: "date", name: "started", required: true },
      { type: "date", name: "ended" },
      { type: "number", name: "duration_min", min: 0 },
      { type: "number", name: "volume_kg", min: 0 },
      { type: "number", name: "shoulder", min: 0, max: 10, onlyInt: true },
      { type: "text", name: "note", max: 1000 },
      { type: "json", name: "prep_done", maxSize: 2000 },
      { type: "text", name: "client_id", max: 60 },
      ...ts,
    ],
    indexes: [
      "CREATE INDEX idx_sessions_user_started ON sessions (user, started)",
      "CREATE UNIQUE INDEX idx_sessions_client ON sessions (user, client_id) WHERE client_id != ''",
    ],
  });
  app.save(sessions);

  const viaSession = `${authed} && session.user = @request.auth.id`;
  const childRules = {
    listRule: viaSession,
    viewRule: viaSession,
    createRule: `${viaSession} && @request.body.session.user = @request.auth.id`,
    updateRule: viaSession,
    deleteRule: viaSession,
  };

  const setLogs = new Collection({
    type: "base",
    name: "set_logs",
    ...childRules,
    fields: [
      { type: "relation", name: "session", collectionId: sessions.id, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "relation", name: "exercise", collectionId: exercises.id, maxSelect: 1, required: true },
      { type: "number", name: "set_no", min: 1, onlyInt: true, required: true },
      { type: "number", name: "kg", min: 0 },
      { type: "number", name: "reps", min: 0, onlyInt: true },
      { type: "number", name: "rpe", min: 0, max: 10 },
      ...ts,
    ],
    indexes: ["CREATE INDEX idx_set_logs_session ON set_logs (session)", "CREATE INDEX idx_set_logs_exercise ON set_logs (exercise)"],
  });
  app.save(setLogs);

  const cardioLogs = new Collection({
    type: "base",
    name: "cardio_logs",
    ...childRules,
    fields: [
      { type: "relation", name: "session", collectionId: sessions.id, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "select", name: "phase", maxSelect: 1, values: ["aufwaermen", "ausdauer"] },
      { type: "select", name: "device", maxSelect: 1, values: ["crosstrainer", "rad", "laufband", "gemischt"] },
      { type: "number", name: "minutes", min: 0 },
      { type: "number", name: "distance_km", min: 0 },
      { type: "number", name: "avg_hr", min: 0, max: 250, onlyInt: true },
      ...ts,
    ],
    indexes: ["CREATE INDEX idx_cardio_logs_session ON cardio_logs (session)"],
  });
  app.save(cardioLogs);
}, (app) => {
  for (const name of ["cardio_logs", "set_logs", "sessions", "templates", "exercises"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
});
