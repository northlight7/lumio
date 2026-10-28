FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts ./
COPY src ./src
COPY public ./public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN apk add --no-cache su-exec && addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 lumio
COPY --from=builder --chown=lumio:nodejs /app/.next/standalone ./
COPY --from=builder --chown=lumio:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=lumio:nodejs /app/public ./public
COPY --chown=lumio:nodejs scripts ./scripts
COPY --chown=lumio:nodejs migrations ./migrations
COPY --chown=lumio:nodejs curriculum ./curriculum
COPY scripts/entrypoint.sh /usr/local/bin/lumio-entrypoint
RUN chmod 755 /usr/local/bin/lumio-entrypoint
ENTRYPOINT ["/usr/local/bin/lumio-entrypoint"]
EXPOSE 3000
CMD ["node", "server.js"]
