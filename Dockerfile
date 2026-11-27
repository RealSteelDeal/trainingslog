# 1) Frontend bauen (statische PWA)
FROM node:22-alpine AS web
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
ARG GIT_SHA=dev
RUN printf '{"sha":"%s"}\n' "$GIT_SHA" > build/version.json

# 2) PocketBase mit Migrationen und gebautem Frontend
FROM alpine:3.22
ARG PB_VERSION=0.40.6
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pb.zip \
 && unzip /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip

COPY backend/pb_migrations /pb/pb_migrations
COPY --from=web /app/build /pb/pb_public
VOLUME /pb/pb_data
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--publicDir=/pb/pb_public"]
