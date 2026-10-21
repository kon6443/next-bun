# 운영 런타임은 Node 24 다 (백엔드와 같은 node:24-bookworm-slim).
# Bun 런타임은 연결 단계에서 http.request timeout 이 동작하지 않아(oven-sh/bun#41133) next-auth 의
# 카카오 호출 10초 상한이 무력화되고, 조용히 끊긴 유휴 소켓을 재사용하면 멈춘다 — docs/tasks/kakao-login-latency-front.md
# 패키지 매니저는 pnpm 이다(package.json packageManager 고정 버전, corepack 이 받는다).

# 1. 의존성 설치
FROM node:24-bookworm-slim AS base
# corepack 은 Node 24 까지 기본 포함이다 — Node 25+ 로 올리면 `npm i -g corepack` 이 먼저 필요하다
# 비대화형 빌드에서 corepack 이 pnpm 다운로드 확인을 묻지 않게 한다
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
# pnpm store 를 빌드 간에 재사용한다 (BuildKit cache mount — 이미지 레이어에는 남지 않는다)
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --store-dir /pnpm/store

# 2. Next 빌드 — next 바이너리를 node 로 직접 실행한다
FROM base AS builder
WORKDIR /app
COPY . .

COPY .env.build .env.local
# 빌드 커밋 SHA — 피드백 buildSha 로 번들에 인라인된다(NEXT_PUBLIC_). CI 가 build-args 로 넘기고, 없으면 빈 값이라 생략된다
# COPY 뒤에 둬서 SHA 가 바뀌어도 의존성·소스 복사 레이어 캐시는 그대로 쓴다
ARG NEXT_PUBLIC_BUILD_SHA=""
ENV NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA
# 카카오 JavaScript 키 — 리플레이 카카오톡 공유. 공개 키(번들에 들어감, 보호는 카카오 앱의 허용 도메인)
# CI 가 GitHub Actions 시크릿 KAKAO_JS_KEY 를 build-args 로 넘기고, 없으면 빈 값이라 카카오톡 공유 버튼만 숨는다
ARG NEXT_PUBLIC_KAKAO_JS_KEY=""
ENV NEXT_PUBLIC_KAKAO_JS_KEY=$NEXT_PUBLIC_KAKAO_JS_KEY
# Next 컴파일 캐시를 빌드 간에 재사용한다
RUN --mount=type=cache,target=/app/.next/cache node node_modules/next/dist/bin/next build

# 3. 운영 이미지 — standalone 출력만 담는다 (pnpm 없음)
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
