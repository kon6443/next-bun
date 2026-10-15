# 1. Base image for installing dependencies
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lockb ./
# bun 패키지 캐시를 빌드 간에 재사용한다 (BuildKit cache mount — 이미지 레이어에는 남지 않는다)
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# 2. Builder image for building the application
FROM base AS builder
WORKDIR /app
COPY . .

COPY .env.build .env.local
# Next 컴파일 캐시를 빌드 간에 재사용한다
RUN --mount=type=cache,target=/app/.next/cache bun run build

# 3. Production image
FROM oven/bun:1 AS production
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "server.js"]
