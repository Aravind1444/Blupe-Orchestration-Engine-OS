# Use compact, official alpine-based Node.js image to minimize latency and cold start times
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Run as a non-privileged user for security isolation inside Cloud Run
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs --from=deps /app/node_modules ./node_modules

USER nodejs

EXPOSE 8080

CMD ["node", "server.js"]
