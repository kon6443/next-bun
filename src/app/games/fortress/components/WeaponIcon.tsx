import type { WeaponFx } from "../renderer/vivid";
import { weaponFx } from "../renderer/vivid";

const INK = "#160b1c";

/** 탄 몸통(위를 향해 45° 누운 툰 탄) — 잉크 외곽선 + 무기 색 탄두 + 윗면 빛 */
function Shell({ x, y, s, body, tip, rot = -45 }: { x: number; y: number; s: number; body: string; tip: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-5 -3 L2 -3 Q6 -3 8 0 Q6 3 2 3 L-5 3 Z" fill={body} stroke={INK} strokeWidth={1.4 / s} strokeLinejoin="round" />
      <path d="M3 -2.6 Q6 -2.2 8 0 Q6 2.2 3 2.6 Z" fill={tip} stroke={INK} strokeWidth={1.1 / s} strokeLinejoin="round" />
      <rect x="-4" y="-2.2" width="5" height="1.1" fill="rgba(255,255,255,0.45)" />
    </g>
  );
}

/**
 * 무기 아이콘(D-025 보충 6) — 6종을 탄 모양으로. 잉크 외곽선·탄 연출(WeaponFx)과 같은 색. 장식 그림이라 낭독하지 않는다
 * 포탄 = 탄 하나 · 3연발 = 부채꼴 셋 · 대형탄 = 굵은 탄 + 띠 · 분열탄 = 보라 탄 + 불티 · 메가탄 = 빛무리 속 큰 탄 · 폭격 = 날개 달린 폭탄 셋
 */
export function WeaponIcon({ weaponId, size = 24, className }: { weaponId: number; size?: number; className?: string }) {
  const fx: WeaponFx = weaponFx(weaponId);
  const tip = `rgb(${fx.glow.join(",")})`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" data-weapon-icon={fx.kind}>
      {fx.kind === "shell" ? <Shell x={11} y={13} s={1.3} body={fx.body} tip={tip} /> : null}
      {fx.kind === "triple" ? (
        <>
          <Shell x={8} y={16} s={0.85} body={fx.body} tip={tip} rot={-70} />
          <Shell x={12} y={13} s={0.85} body={fx.body} tip={tip} rot={-45} />
          <Shell x={16} y={16} s={0.85} body={fx.body} tip={tip} rot={-20} />
        </>
      ) : null}
      {fx.kind === "heavy" ? (
        <g>
          <Shell x={11} y={13} s={1.65} body={fx.body} tip={tip} />
          <path d="M8.2 12.6 L11.4 9.4" stroke="#f6c453" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ) : null}
      {fx.kind === "split" ? (
        <>
          <Shell x={10} y={14} s={1.2} body={fx.body} tip={tip} />
          {[
            [18, 5],
            [20.5, 9],
            [15.5, 3.5],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill={tip} stroke={INK} strokeWidth="0.8" />
          ))}
        </>
      ) : null}
      {fx.kind === "mega" ? (
        <>
          <path d="M12 1.5 L14 7 L19.5 5 L16.5 10 L22 12 L16.5 14 L19.5 19 L14 17 L12 22.5 L10 17 L4.5 19 L7.5 14 L2 12 L7.5 10 L4.5 5 L10 7 Z" fill="rgba(255,196,80,0.9)" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
          <Shell x={11.5} y={12.5} s={1.35} body={fx.body} tip={tip} />
        </>
      ) : null}
      {fx.kind === "strike"
        ? [6, 12, 18].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 1 ? 10 : 13})`}>
              <path d="M-2 -6 L0 -4 L2 -6 L2 -3 L-2 -3 Z" fill={fx.body} stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
              <ellipse cx="0" cy="0" rx="2.4" ry="3.6" fill={fx.body} stroke={INK} strokeWidth="1.1" />
              <ellipse cx="0" cy="2.2" rx="1.7" ry="1.4" fill={tip} />
            </g>
          ))
        : null}
    </svg>
  );
}
