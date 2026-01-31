# 1. Base image for installing dependencies
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# 2. Builder image for building the application
FROM base AS builder
WORKDIR /app
COPY . .

COPY .env.build .env.local
RUN bun run build

# 3. Production image
FROM oven/bun:1 AS production
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "server.js"]
