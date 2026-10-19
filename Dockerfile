# 운영 런타임은 Node 24 다 (백엔드와 같은 node:24-bookworm-slim).
# Bun 런타임은 연결 단계에서 http.request timeout 이 동작하지 않아(oven-sh/bun#41133) next-auth 의
# 카카오 호출 10초 상한이 무력화되고, 조용히 끊긴 유휴 소켓을 재사용하면 멈춘다 — docs/tasks/kakao-login-latency-front.md
# bun 은 bun.lockb 로 의존성을 설치하는 패키지 매니저로만 쓴다(빌드·실행은 Node).

# 1. 의존성 설치 — Node 이미지에 bun 바이너리만 넣는다 (빌드와 실행을 같은 Node 로 맞추기 위해 bun 이미지를 쓰지 않는다)
FROM node:24-bookworm-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lockb ./
# bun 패키지 캐시를 빌드 간에 재사용한다 (BuildKit cache mount — 이미지 레이어에는 남지 않는다)
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

# 2. Next 빌드 — next 바이너리를 node 로 직접 실행한다 (bun run 을 거치지 않아 빌드 런타임이 확실히 Node 다)
FROM base AS builder
WORKDIR /app
COPY . .

COPY .env.build .env.local
# Next 컴파일 캐시를 빌드 간에 재사용한다
RUN --mount=type=cache,target=/app/.next/cache node node_modules/next/dist/bin/next build

# 3. 운영 이미지 — standalone 출력만 담는다 (bun 바이너리 없음)
FROM node:24-bookworm-slim AS production
WORKDIR /app
# root 가 아닌 이미지 기본 사용자(node)로 실행한다 — 런타임에 .next/cache 등을 쓸 수 있게 소유권을 넘긴다
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
