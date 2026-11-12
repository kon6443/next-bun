/**
 * 시안 "glow"의 WebGL 후처리(D-025 B) — three는 이 파일에서만 쓰고, 이 파일은 경기 화면이 동적 import로만 불러온다(홈·목록 번들에 들어가지 않게)
 * 전장 2D 캔버스(BattleFrame.source)를 1/4 크기로 줄여 올리고 → 밝고 채도 높은 곳만 걸러 → 가로·세로 흐림 1번 → 빛(bloom) + 폭발 충격파 빛을 그린다
 * 결과 캔버스는 2D 캔버스 위에 mix-blend-mode: screen으로 겹친다 — 빛만 더해지므로 이 층이 실패·꺼져도 화면은 vivid 그대로다
 * 움직임 줄이기면 빛 세기를 낮추고(1.2 → 0.6) 충격파 빛·섬광을 끈다
 */

import * as THREE from "three";
import type { BattleFrame } from "../hooks/useBattleView";

export type GlowPost = {
  render: (frame: BattleFrame) => void;
  dispose: () => void;
};

/** 원본을 줄이는 배율 — 빛 계산은 저해상도로 충분하다 */
const DOWN = 4;
/** 출력 캔버스 해상도(화면 대비) — CSS로 늘려 붙인다(빛은 부드러워서 티가 안 난다) */
const OUT = 0.5;
const MAX_BLASTS = 4;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // 밝고 채도 높은 곳(불꽃·탄·불티)만 — 하늘·구름처럼 넓게 밝은 면은 채도가 낮아 거의 걸리지 않게(화면이 뿌옇게 번지지 않게)
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float k = smoothstep(0.5, 0.85, l) * smoothstep(0.38, 0.72, sat);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
  s += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
  s += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.070;
  s += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

const FINAL = /* glsl */ `
uniform sampler2D tBloom;
uniform float uStrength;
uniform float uFlash;
uniform vec2 uSize;
uniform vec4 uBlasts[${MAX_BLASTS}];
uniform int uCount;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tBloom, vUv).rgb * uStrength;
  // 폭발 충격파 빛 — 화면 px 기준 고리(진행에 따라 퍼지며 옅어진다)
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  for (int i = 0; i < ${MAX_BLASTS}; i++) {
    if (i >= uCount) break;
    vec4 b = uBlasts[i];
    float prog = b.w;
    float radius = b.z * (0.7 + 1.8 * prog);
    float d = length(p - b.xy);
    float width = 6.0 + b.z * 0.18;
    // 제곱은 곱으로 — pow(음수, y)는 GLSL에서 정의되지 않아 일부 GPU(ANGLE→D3D)에서 NaN(검은 구멍)이 난다
    float q = (d - radius) / width;
    float ring = exp(-q * q) * (1.0 - prog);
    float q2 = d / (b.z * 0.9);
    float core = exp(-q2 * q2) * (1.0 - prog) * 0.6;
    c += vec3(1.0, 0.72, 0.4) * (ring * 0.55 + core);
  }
  c += vec3(1.0, 0.95, 0.85) * uFlash * 0.25;
  gl_FragColor = vec4(c, 1.0);
}`;

/** WebGL을 못 쓰면 null — 호출부는 후처리 없이(vivid 그대로) 둔다 */
export function createGlowPost(target: HTMLCanvasElement): GlowPost | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: target, alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.autoClear = false;

  const down = document.createElement("canvas");
  const downCtx = down.getContext("2d");
  if (!downCtx) {
    renderer.dispose();
    return null;
  }
  const srcTex = new THREE.CanvasTexture(down);
  srcTex.minFilter = THREE.LinearFilter;
  srcTex.magFilter = THREE.LinearFilter;
  srcTex.generateMipmaps = false;
  srcTex.colorSpace = THREE.NoColorSpace;

  const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  scene.add(quad);

  const bright = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BRIGHT, uniforms: { tSrc: { value: srcTex } }, depthTest: false, depthWrite: false });
  const blur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
  const blasts = Array.from({ length: MAX_BLASTS }, () => new THREE.Vector4());
  const final = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FINAL,
    uniforms: { tBloom: { value: rtA.texture }, uStrength: { value: 1 }, uFlash: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uBlasts: { value: blasts }, uCount: { value: 0 } },
    depthTest: false,
    depthWrite: false,
  });

  let size = { w: 0, h: 0 };
  const pass = (mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) => {
    quad.material = mat;
    renderer.setRenderTarget(to);
    renderer.render(scene, camera);
  };

  return {
    render(frame) {
      const dw = Math.max(1, Math.round(frame.width / DOWN));
      const dh = Math.max(1, Math.round(frame.height / DOWN));
      if (size.w !== frame.width || size.h !== frame.height) {
        size = { w: frame.width, h: frame.height };
        down.width = dw;
        down.height = dh;
        rtA.setSize(dw, dh);
        rtB.setSize(dw, dh);
        renderer.setSize(Math.max(1, Math.round(frame.width * OUT)), Math.max(1, Math.round(frame.height * OUT)), false);
        srcTex.dispose();
      }
      downCtx.drawImage(frame.source, 0, 0, dw, dh);
      srcTex.needsUpdate = true;

      pass(bright, rtA);
      // 흐림 1번 — 빛 반경을 좁혀 잉크 외곽선이 빛에 묻히지 않게
      for (let i = 0; i < 1; i++) {
        blur.uniforms.tSrc.value = rtA.texture;
        (blur.uniforms.uDir.value as THREE.Vector2).set(1 / dw, 0);
        pass(blur, rtB);
        blur.uniforms.tSrc.value = rtB.texture;
        (blur.uniforms.uDir.value as THREE.Vector2).set(0, 1 / dh);
        pass(blur, rtA);
      }

      const calm = frame.reducedMotion;
      final.uniforms.uStrength.value = calm ? 0.6 : 1.2;
      final.uniforms.uFlash.value = calm ? 0 : frame.flash;
      (final.uniforms.uSize.value as THREE.Vector2).set(frame.width, frame.height);
      const list = calm ? [] : frame.blasts.slice(0, MAX_BLASTS);
      list.forEach((b, i) => blasts[i].set(b.x, b.y, b.r, b.progress));
      final.uniforms.uCount.value = list.length;
      pass(final, null);
    },
    dispose() {
      srcTex.dispose();
      rtA.dispose();
      rtB.dispose();
      bright.dispose();
      blur.dispose();
      final.dispose();
      quad.geometry.dispose();
      renderer.dispose();
      // 컨텍스트도 바로 놓는다 — 다시하기마다 새로 만들어 GC 전까지 쌓이면 "Too many active WebGL contexts"로 오래된 것이 끊긴다
      renderer.forceContextLoss();
    },
  };
}
