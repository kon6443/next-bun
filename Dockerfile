# 1. Base image for installing dependencies
FROM oven/bun:1 as base
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# # 2. Builder image for building the application
# FROM base as builder
# WORKDIR /app
# COPY . .
# RUN bun run build

# 2. Builder image for building the application
FROM base as builder
WORKDIR /app
COPY . .

COPY .env.local .
RUN bun run build

# 3. Production image
FROM oven/bun:1 as production
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["bun", "server.js"]
