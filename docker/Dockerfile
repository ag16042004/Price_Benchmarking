# One image: builds the React app, then runs the API Server and the Scrape Engine worker as two processes.
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/public PORT=10000 QUEUE=bull
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend ./
RUN npx prisma generate
COPY --from=web /web/dist ./public
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# db push creates/updates tables from the schema; the seed is idempotent (item types, sources, optional admin).
CMD ["npm", "run", "start:prod"]
