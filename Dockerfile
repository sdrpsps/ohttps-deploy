FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/app ./app
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/data /app/certs /app/logs && chown -R app:app /app
USER app
ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "server.js"]
