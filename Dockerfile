# 1) Frontend bauen (statische PWA)
FROM node:22-alpine AS web
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
ARG GIT_SHA=dev
RUN printf '{"sha":"%s"}\n' "$GIT_SHA" > build/version.json

# 2) PocketBase als Go-Programm (offizielle Version + Push-Versand), Version in backend/go.mod
FROM golang:1.27.4-alpine AS pb
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pocketbase .

# 3) Laufzeit: Binary, Migrationen, gebautes Frontend
FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
COPY --from=pb /out/pocketbase /pb/pocketbase
COPY backend/pb_migrations /pb/pb_migrations
COPY --from=web /app/build /pb/pb_public
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--publicDir=/pb/pb_public"]
