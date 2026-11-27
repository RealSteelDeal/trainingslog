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
web/src/routes/+page.svelte  Login, Vorlagen, letzte Einheiten, Sync-Status
web/src/routes/einheit/      Einheit erfassen und abschließen
web/tests/unit/              node:test (Vorlagen, Outbox) – liest Startdaten aus der Seed-Migration
web/tests/e2e/               Playwright gegen gemockte API (tests/helpers/mock-api.js)
tools/import-artifact.mjs    Import des JSON-Exports aus dem alten claude.ai-Artefakt
```

## Datenmodell

`exercises` (key, name, kind kraft|cardio|schulter) · `templates` (key, kind, `phases` JSON, `blocks` JSON) · `sessions` (user, template, kind, phase, started, duration_min, volume_kg, shoulder 0–10, note, prep_done, client_id) · `set_logs` (session, exercise, set_no, kg, reps, rpe) · `cardio_logs` (session, phase aufwaermen|ausdauer, device, minutes, distance_km, avg_hr).

Übungen/Vorlagen ohne `user` sind global. Einheiten und ihre Kind-Datensätze sieht nur der Besitzer (API-Regeln in der Init-Migration). Vorlagen-Werte wie `"phase.sets"` oder `"phase.cardio_min*60"` löst `resolveValue` auf.

## Regeln

- **Migrationen nie nachträglich ändern.** Jede Schema- oder Datenänderung ist eine neue Datei `backend/pb_migrations/<unix-timestamp>_<name>.js` mit `up` und `down`. Die Live-Datenbank hat die alten schon ausgeführt.
- **Offline zuerst:** Schreibzugriffe aus der Einheit laufen über die Outbox, nie direkt. Neue Kind-Tabellen in `outbox.js` schrittweise mit Fortschrittszähler hochladen, damit ein Abbruch keine Duplikate erzeugt.
- **Svelte-5-Falle:** Bei `$state`-Objekten nie `const x = (s.a[k] ||= [])` – das liefert das rohe Array statt des Proxys, Änderungen gehen verloren. Erst zuweisen, dann `s.a[k]` lesen. Kein Schreiben in `$state` während des Renderns.
- **Mobile:** Touch-Ziele mindestens 44 px, Eingaben 16 px (kein iOS-Zoom), Layout ab 360 px Breite prüfen, dunkles und helles Theme über `light-dark()`.
- **Texte in der App deutsch**, Code-Namen englisch: JS camelCase, Komponenten PascalCase, DB-Felder snake_case. Clean Code, Kommentare nur wo das Warum nicht offensichtlich ist.
- Abhängigkeiten exakt pinnen (`--save-exact`), keine Releases jünger als zwei Wochen.
- Keine Zugangsdaten ins Repo. Secrets nur als GitHub-Secrets.

## Fachliches (vom Nutzer festgelegt)

- 2× pro Woche Ganzkörper-Krafttag (64 min), optional Mittwochvormittag Ausdauertag (59 min).
- Ablauf: 10 min Aufwärmen auf Gerät → Schulter-Vorbereitung am Kabelzug (Außenrotation, Pull-Aparts, Face Pulls) → Kraft in Supersätzen A–D → Ausdauer Zone 2.
- Phase a (Woche 1–2): 2 Sätze, Kraft 22 / Ausdauer 28 min. Phase b (ab Woche 3): 3 Sätze, Kraft 30 / Ausdauer 20 min.
- Schulter zweimal am Labrum operiert. Keine Übungen vorschlagen mit Dips, Nackendrücken/-latzug, Butterfly mit tiefer Dehnung, breitem Bankdrücken bis zur Brust, schwerem Überkopfdrücken. Schulterwert 0–10 wird pro Einheit erfasst.
- Ziel: Gesundheit und Ausdauer zuerst, dazu Rücken (Ausgleich Bürojob), Brust, Arme.

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

## Deployment

Push auf `main` → GitHub Actions (`.github/workflows/image.yml`):
1. **test:** Unit-Tests, Build, Playwright
2. **image:** Docker-Build, Smoke-Test im Container (Migrationen laufen durch, 2 Vorlagen, 12 Übungen, Einheiten ohne Login gesperrt, `version.json` = Commit), Push nach ghcr.io (`latest` + Commit-SHA)
3. **deploy:** Hostinger-API `POST /api/vps/v1/virtual-machines/1972658/docker/trainingslog/update` (Secret `HOSTINGER_API_TOKEN`), dann warten, bis `https://training.schuetters.at/version.json` den neuen Commit meldet

Pull Requests laufen nur durch test und image (ohne Push). Daten liegen auf dem VPS in `/docker/trainingslog/pb_data`; Backups über PocketBase (Settings → Backups).
