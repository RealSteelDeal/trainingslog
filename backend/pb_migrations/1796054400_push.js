/// <reference path="../pb_data/types.d.ts" />

// Push-Benachrichtigungen. Abos, Jobs und VAPID-Schlüssel sind nur über die
// Go-Routen unter /api/push erreichbar (keine API-Regeln = nur Superuser).
// users.notify: { tz, rest, reminder, upload, weekly, plan: [{ day 0–6, time "HH:MM", kind }] }

migrate((app) => {
  const usersId = app.findCollectionByNameOrId("users").id;
  const ts = [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];

  app.save(new Collection({
    type: "base",
    name: "push_subscriptions",
    fields: [
      { type: "relation", name: "user", collectionId: usersId, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "text", name: "endpoint", required: true, max: 2000 },
      { type: "text", name: "p256dh", required: true, max: 200 },
      { type: "text", name: "auth", required: true, max: 100 },
      { type: "text", name: "origin", max: 200 },
      { type: "text", name: "ua", max: 300 },
      { type: "number", name: "failures", onlyInt: true },
      ...ts,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_sub_endpoint ON push_subscriptions (endpoint)"],
  }));

  app.save(new Collection({
    type: "base",
    name: "push_jobs",
    fields: [
      { type: "relation", name: "user", collectionId: usersId, maxSelect: 1, cascadeDelete: true, required: true },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["rest", "timer", "reminder", "upload", "weekly", "test"] },
      { type: "text", name: "ref", max: 200 },
      { type: "date", name: "fire_at", required: true },
      { type: "text", name: "title", max: 200 },
      { type: "text", name: "body", max: 500 },
      { type: "text", name: "url", max: 200 },
      { type: "date", name: "sent" },
      { type: "bool", name: "cancelled" },
      { type: "text", name: "error", max: 500 },
      ...ts,
    ],
    indexes: [
      "CREATE INDEX idx_push_jobs_due ON push_jobs (sent, cancelled, fire_at)",
      "CREATE INDEX idx_push_jobs_ref ON push_jobs (user, ref)",
    ],
  }));

  app.save(new Collection({
    type: "base",
    name: "push_keys",
    fields: [
      { type: "text", name: "public", required: true, max: 200 },
      { type: "text", name: "private", required: true, max: 200 },
      ...ts,
    ],
  }));

  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new JSONField({ name: "notify", maxSize: 20000 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("notify");
  app.save(users);
  for (const name of ["push_keys", "push_jobs", "push_subscriptions"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
