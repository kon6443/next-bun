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
# root 가 아닌 이미지 기본 사용자(bun)로 실행한다 — 런타임에 .next/cache 등을 쓸 수 있게 소유권을 넘긴다
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
USER bun

EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "server.js"]
