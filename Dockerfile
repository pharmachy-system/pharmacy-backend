# ── Stage 1: Install production dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first — Docker layer caches the node_modules install
# step and only re-runs it when package*.json changes.
COPY package.json package-lock.json ./

# ci: clean install; --omit=dev: skip devDependencies (jest, nodemon, etc.)
RUN npm ci --omit=dev


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

ARG NODE_VERSION=20
ARG BUILD_DATE
ARG GIT_SHA

LABEL org.opencontainers.image.title="Al Ansar Pharmacy API" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.source="https://github.com/your-org/pharmacy-backend"

# Security: run as a non-root user
RUN addgroup -S pharmacy && adduser -S pharmacy -G pharmacy

WORKDIR /app

# Copy production node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY index.js ./
COPY src/    ./src/
COPY scripts/ ./scripts/

# Create writable logs directory (mounted as a volume in production)
RUN mkdir -p logs && chown -R pharmacy:pharmacy /app

# Drop root privileges
USER pharmacy

EXPOSE 5000

# Health check — calls the /health endpoint every 30 s.
# start-period gives the app time to connect to Atlas before checks begin.
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node scripts/healthcheck.js

# Start the server.
# In Railway / Render, override this to run index sync first:
#   node scripts/ensure-indexes.js && node index.js
CMD ["node", "index.js"]
