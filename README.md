# Trainingslog

Web-App zum Erfassen und Auswerten von Trainingseinheiten. Läuft im Browser und lässt sich als App installieren (PWA). Mehrbenutzerfähig, vorerst ein Konto.

**Stack:** PocketBase 0.40.6 (Backend, SQLite, Login, REST-API, Admin-Oberfläche) · SvelteKit 2 + Svelte 5 als statische PWA · Docker.

PocketBase liefert das gebaute Frontend selbst aus. Ein einziger Container reicht; HTTPS macht der vorhandene Caddy auf dem VPS.

## Aufbau

```
backend/pb_migrations/      Datenbankschema + Startdaten (Übungen, Vorlagen)
web/src/lib/                Datenzugriff, Vorlagen-Auflösung, Offline-Outbox, laufende Einheit
web/src/routes/             Startseite (/), Einheit (/einheit)
tools/import-artifact.mjs   Import der Daten aus dem claude.ai-Artefakt
Dockerfile                  baut Frontend und PocketBase in ein Image
docker-compose.yml          Container im Netzwerk "web" hinter dem vorhandenen Caddy
caddy-snippet.txt           Eintrag für /docker/caddy/Caddyfile
.github/workflows/image.yml baut das Image bei jedem Push nach ghcr.io
```

## Offline-Verhalten

- Die laufende Einheit liegt im Browser-Speicher. Neuladen, Bildschirmsperre oder Funkloch verlieren nichts; Timer rechnen mit Zeitstempeln und laufen im Hintergrund weiter.
- „Einheit speichern“ legt die Einheit in eine Outbox. Sie wird hochgeladen, sobald Netz und Anmeldung da sind. Jeder Schritt wird gemerkt, ein Abbruch mittendrin erzeugt keine Duplikate (`client_id`).
- Übungen, Vorlagen und Vorwerte werden zwischengespeichert, damit eine Einheit auch offline startet.

## Datenmodell

| Collection | Inhalt | Zugriff |
|---|---|---|
| `exercises` | Übungen (`key`, Name, Art, Hinweis) | global oder eigene |
| `templates` | Vorlagen mit Phasen und Blöcken (JSON) | global oder eigene |
| `sessions` | Einheit: Start, Dauer, Volumen, Schulter 0–10, Notiz | nur eigene |
| `set_logs` | Satz: Übung, Satznummer, kg, Wdh, optional RPE | über die Einheit |
| `cardio_logs` | Aufwärmen/Ausdauer: Gerät, Minuten, Distanz, Puls | über die Einheit |

## Deployment auf dem VPS (srv1972658, Ubuntu 24.04, Docker, Caddy im Netzwerk `web`)

1. Repo nach GitHub pushen. Der Workflow baut das Image `ghcr.io/<owner>/trainingslog:latest`. Ist das Repo privat, das Paket auf GitHub öffentlich stellen oder auf dem VPS `docker login ghcr.io` ausführen.
2. DNS: A-Record `training` → VPS-IP (bei Hostinger gesetzt).
3. Auf dem VPS: Projekt unter `/docker/trainingslog/` mit `docker-compose.yml` und `.env` (`IMAGE=…`) anlegen, `docker compose up -d`. Alternativ über den Docker Manager im hPanel mit dem Inhalt der Compose-Datei (ohne `build:`).
4. Den Block aus `caddy-snippet.txt` in `/docker/caddy/Caddyfile` ergänzen und Caddy neu laden.
5. Admin anlegen: `docker exec trainingslog /pb/pocketbase superuser upsert ADMIN_EMAIL PASSWORT --dir /pb/pb_data`
6. Unter `https://training.schuetters.at/_/` anmelden, in `users` dein Konto anlegen.
7. **Backups:** im Dashboard unter Settings → Backups einen täglichen Cron setzen, oder `/docker/trainingslog/pb_data` sichern.
8. Daten aus dem Artefakt übernehmen: im Artefakt „Daten kopieren (JSON)“, in `export.json` speichern, dann
   `PB_URL=https://training.schuetters.at PB_EMAIL=… PB_PASSWORD=… node tools/import-artifact.mjs export.json`
   (mehrfach ausführbar, schon importierte Einheiten werden übersprungen).

## Lokal entwickeln und testen

```
# PocketBase 0.40.6 von github.com/pocketbase/pocketbase/releases ins Repo-Root
./pocketbase serve --dir=backend/pb_data --migrationsDir=backend/pb_migrations
cd web && npm ci && npm run dev        # leitet /api und /_/ an :8090 weiter
npm run test:unit                       # Logik (Vorlagen, Offline-Outbox)
npm run build && npm run test:e2e       # Browser-Tests mit gemockter API
```

## Automatisches Ausrollen

Jeder Push auf `main` testet, baut das Image, prüft es im Container und rollt es über die Hostinger-API auf dem VPS aus. Voraussetzung: Repo-Secret `HOSTINGER_API_TOKEN` (hPanel → Profil → API). Fehlt es, wird nur gebaut. Details in `CLAUDE.md`.

## Stand

- [x] Schema, Startdaten, Docker, PWA-Grundgerüst, Import
- [x] MVP: Einheit aus Vorlage starten, Sätze erfassen mit Vorwerten, Timer, Supersatz-Pausen, Abschluss, Offline-Outbox
- [x] Tests (Unit + Playwright), automatisches Ausrollen
- [ ] Auswertungen pro Einheit, Woche, Monat, Jahr, Übung; CSV-Export
- [ ] Progressionsvorschläge, Phasenwechsel, Schulter-Auswertung
