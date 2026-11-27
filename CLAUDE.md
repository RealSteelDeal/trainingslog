# Trainingslog – Projektkontext für Claude Code

Private Web-App (PWA) von Lukas zum Erfassen und Auswerten seiner Einheiten im Fitnessstudio. Wird im Studio am Handy mit einer Hand bedient, oft mit schlechtem Empfang. Live unter https://training.schuetters.at. Vorerst ein Nutzer, mehrbenutzerfähig angelegt.

## Stack

- **Backend:** PocketBase 0.40.6 (SQLite, Auth, REST, Admin unter `/_/`). Version im `Dockerfile` (`PB_VERSION`) gepinnt.
- **Frontend:** SvelteKit 2 + Svelte 5 (Runes), `adapter-static`, `ssr = false`, `prerender = true`. PocketBase liefert den Build aus `pb_public` aus.
- **Ein Container**, Image `ghcr.io/realsteeldeal/trainingslog`, auf dem Hostinger-VPS hinter Caddy (Netzwerk `web`).

## Struktur

```
backend/pb_migrations/       Schema + Startdaten (JS-Migrationen, PocketBase-API ab 0.23)
web/src/lib/pb.js            PocketBase-Client (same origin)
web/src/lib/data.js          Katalog-Cache, Vorlagen-Auflösung (resolveTemplate), Vorwerte
web/src/lib/outbox.js        Offline-Warteschlange, schrittweiser Upload mit client_id
web/src/lib/live.svelte.js   laufende Einheit ($state + localStorage), Zeiten über Zeitstempel
web/src/lib/phase.js         Phasenwechsel am Konto (users.phase_log), lokal gecacht, offline nachgereicht
web/src/lib/stats.js         Auswertungen: Server-Daten + Outbox zusammenführen, Wochen-Soll/Ist, CSV
web/src/lib/*Chart.svelte    Diagramme als Inline-SVG, ohne Bibliothek
web/src/lib/ExerciseHelp.svelte  Bottom-Sheet mit Übungshilfe (Gerät, Ausführung, Schulter, Fehler, Alternativen)
web/src/routes/+page.svelte  Login, Vorlagen, letzte Einheiten, Sync-Status
web/src/routes/einheit/      Einheit erfassen (Übungskarten mit Stepper, „Jetzt“-Markierung, Hilfe); Kopfzeile verkleinert sich beim Scrollen, Uhr öffnet die Steuerung (Pause, Beenden, Verwerfen – je mit Sicherheitsfrage); Abschlussfragen erst nach „Training beenden“
web/src/routes/auswertung/   Woche (Soll/Ist), Verlauf pro Übung, Schulterwert, CSV-Export
web/tests/unit/              node:test (Vorlagen, Outbox, Auswertungen) – liest Startdaten und Hilfetexte aus den Daten-Migrationen
web/tests/e2e/               Playwright gegen gemockte API (tests/helpers/mock-api.js)
tools/import-artifact.mjs    Import des JSON-Exports aus dem alten claude.ai-Artefakt
```

## Datenmodell

`users` (+ `phase_log` JSON: [{ phase, from: Montag YYYY-MM-DD }]) · `exercises` (key, name, kind kraft|cardio|schulter, hint, `help` JSON: geraet, ausfuehrung[], schulter, fehler[], alternativen[]) · `templates` (key, kind, `phases` JSON, `blocks` JSON) · `sessions` (user, template, kind, phase, started, duration_min, volume_kg, shoulder 0–10, note, prep_done, client_id) · `set_logs` (session, exercise, set_no, kg, reps, rpe) · `cardio_logs` (session, phase aufwaermen|ausdauer, device, minutes, distance_km, avg_hr).

Übungen/Vorlagen ohne `user` sind global. Einheiten und ihre Kind-Datensätze sieht nur der Besitzer (API-Regeln in der Init-Migration). Vorlagen-Werte wie `"phase.sets"` oder `"phase.cardio_min*60"` löst `resolveValue` auf.

## Regeln

- **Migrationen nie nachträglich ändern.** Jede Schema- oder Datenänderung ist eine neue Datei `backend/pb_migrations/<unix-timestamp>_<name>.js` mit `up` und `down`. Die Live-Datenbank hat die alten schon ausgeführt.
- **Offline zuerst:** Schreibzugriffe aus der Einheit laufen über die Outbox, nie direkt. Neue Kind-Tabellen in `outbox.js` schrittweise mit Fortschrittszähler hochladen, damit ein Abbruch keine Duplikate erzeugt.
- **Svelte-5-Falle:** Bei `$state`-Objekten nie `const x = (s.a[k] ||= [])` – das liefert das rohe Array statt des Proxys, Änderungen gehen verloren. Erst zuweisen, dann `s.a[k]` lesen. Kein Schreiben in `$state` während des Renderns.
- **Mobile:** Referenzgerät iPhone 12 (390 × 844, Safe Areas). Touch-Ziele mindestens 44 px, Eingaben 16 px (kein iOS-Zoom), Layout ab 360 px Breite prüfen, dunkles und helles Theme über `light-dark()`. `tests/e2e/ui.spec.js` prüft Touch-Ziele und horizontalen Scroll.
- **Texte in der App deutsch**, Code-Namen englisch: JS camelCase, Komponenten PascalCase, DB-Felder snake_case. Clean Code, Kommentare nur wo das Warum nicht offensichtlich ist.
- Abhängigkeiten exakt pinnen (`--save-exact`), keine Releases jünger als zwei Wochen.
- Keine Zugangsdaten ins Repo. Secrets nur als GitHub-Secrets.

## Fachliches (vom Nutzer festgelegt)

- 2× pro Woche Ganzkörper-Krafttag (64 min), optional Mittwochvormittag Ausdauertag (59 min).
- Ablauf: 10 min Aufwärmen auf Gerät → Schulter-Vorbereitung am Kabelzug (Außenrotation, Pull-Aparts, Face Pulls) → Kraft in Supersätzen A–D → Ausdauer Zone 2.
- Phase a (Woche 1–2): 2 Sätze, Kraft 22 / Ausdauer 28 min. Phase b (ab Woche 3): 3 Sätze, Kraft 30 / Ausdauer 20 min.
- Schulter zweimal am Labrum operiert. Keine Übungen vorschlagen mit Dips, Nackendrücken/-latzug, Butterfly mit tiefer Dehnung, breitem Bankdrücken bis zur Brust, schwerem Überkopfdrücken. Schulterwert 0–10 wird pro Einheit erfasst.
- Hilfetexte der Übungen (Migration `1795795200_exercise_help.js`) sind allgemeines Trainingswissen, nicht fachlich geprüft; Anpassung nach den ersten Trainings. Stufe 2: eigene SVG-Piktogramme pro Gerät.
- Ziel: Gesundheit und Ausdauer zuerst, dazu Rücken (Ausgleich Bürojob), Brust, Arme.
- Steigerungsvorschlag: Haben beim letzten Mal alle Sätze einer Übung die obere Wdh-Grenze erreicht, schlägt die Karte das schwerste Gewicht + 2,5 kg vor (`progressionHint` in `data.js`). Übernehmen setzt kg und Wdh auf die untere Grenze; nichts wird automatisch geändert.
- Auswertung: Wochen-Soll fest 2 Krafttage und Zone 2 = 2 × `cardio_min` der Phase, die in der jeweiligen Woche galt. Ein Phasenwechsel (Startseite) gilt ab dem Montag der Woche, in der er eingestellt wird, und liegt am Benutzerkonto (alle Geräte gleich; vergangene Wochen behalten ihr Soll). Vor dem ersten Wechsel gilt Phase a. Mittwoch ist Bonus, nicht im Soll. WHO 150 min (Zone 2 + Aufwärmen) nur als neutraler Hinweis, ohne Ampel. Wartende Outbox-Einheiten zählen mit.

## Befehle

```
cd web
npm ci
npm run dev                 # Vite, leitet /api und /_/ an PocketBase :8090 weiter
npm run test:unit           # node:test
npm run build && npm run test:e2e   # Playwright; lokal ohne Playwright-Browser: PW_CHROMIUM_PATH=/pfad/zu/chrome
```

PocketBase lokal (Binary 0.40.6 von GitHub-Releases, im Repo-Root):
`./pocketbase serve --dir=backend/pb_data --migrationsDir=backend/pb_migrations` – beim ersten Start Superuser über den Link im Log anlegen, dann im Dashboard einen `users`-Datensatz.

Vor jedem Commit: `npm run test:unit`, `npm run build`, `npm run test:e2e`. Neue Funktionen bekommen Tests im gleichen Commit.

## Cloud-Sitzungen

- PocketBase liegt unter `/usr/local/bin/pocketbase` (0.40.6): `pocketbase serve --dir=<tmp>/pb_data --migrationsDir=backend/pb_migrations`. Superuser per `pocketbase superuser upsert <mail> <pass> --dir=<tmp>/pb_data`.
- Playwright-Browser ist vorinstalliert: `npm run test:e2e -- --trace off` läuft ohne `PW_CHROMIUM_PATH` und ohne `playwright install`.
- Arbeitsweise: eigener Branch + Pull Request, nie direkt auf `main`. Der Merge auf `main` rollt automatisch live aus.

## Deployment

Push auf `main` → GitHub Actions (`.github/workflows/image.yml`):
1. **test:** Unit-Tests, Build, Playwright
2. **image:** Docker-Build, Smoke-Test im Container (Migrationen laufen durch, 2 Vorlagen, 12 Übungen, Einheiten ohne Login gesperrt, `version.json` = Commit), Push nach ghcr.io (`latest` + Commit-SHA)
3. **deploy:** Hostinger-API `POST /api/vps/v1/virtual-machines/1972658/docker/trainingslog/update` (Secret `HOSTINGER_API_TOKEN`), dann warten, bis `https://training.schuetters.at/version.json` den neuen Commit meldet

Pull Requests laufen nur durch test und image (ohne Push). Daten liegen auf dem VPS in `/docker/trainingslog/pb_data`; Backups über PocketBase (Settings → Backups).
