# Build stage
FROM node:22-slim AS builder
WORKDIR /app

# Install build dependencies and application packages
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build artifacts
COPY . ./
RUN npm run build
# Build the database migration runner
RUN npx esbuild scripts/migrate.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/migrate.cjs
RUN npm prune --production

# Runtime stage
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update && \
    apt-get install -y unzip curl ca-certificates && \
    curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin v1.49.0 && \
    syft version && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=builder /app/Dockerfile.worker ./Dockerfile.worker
COPY --from=builder /app/index.html ./index.html

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "case \"$PROCESS_ROLE\" in worker) exec node dist/worker.cjs ;; bootstrap) exec node dist/bootstrap-initial-owner.cjs ;; migrate) exec node dist/migrate.cjs ;; *) exec node dist/server.cjs ;; esac"]
