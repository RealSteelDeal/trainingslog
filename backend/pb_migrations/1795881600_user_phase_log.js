/// <reference path="../pb_data/types.d.ts" />

// Phasenwechsel am Benutzerkonto statt nur im Browser, damit alle Geräte dasselbe
// Wochen-Soll sehen und vergangene Wochen ihr damaliges Soll behalten.
// phase_log: [{ phase: "a" | "b", from: "YYYY-MM-DD" (Montag der Woche) }]

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new JSONField({ name: "phase_log", maxSize: 20000 }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("phase_log");
  app.save(users);
});
