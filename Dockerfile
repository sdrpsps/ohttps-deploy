FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --chown=app:app --from=build /app/.next/standalone ./
COPY --chown=app:app --from=build /app/.next/static ./.next/static
COPY --chown=app:app --from=build /app/public ./public
COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/app ./app
COPY --chown=app:app --from=build /app/drizzle ./drizzle
COPY --chown=app:app --from=build /app/package.json ./package.json
COPY --chown=app:app --from=build /app/tsconfig.json ./tsconfig.json
COPY --chown=app:app --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/data && chown app:app /app/data
USER app
ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "server.js"]
