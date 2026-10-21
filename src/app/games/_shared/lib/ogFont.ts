/**
 * OG 이미지용 한글 폰트 — 카드에 쓸 글자만 Google Fonts에서 subset으로 받는다(수 KB)
 * 레포에 수 MB 한글 폰트를 두지 않으려는 선택. 실패(외부 네트워크 없음·타임아웃)하면 null → 호출부가 ASCII 카드로 그린다
 */
/** CSS·폰트 파일 두 번의 조회를 합친 예산 — 링크 미리보기(크롤러)를 오래 붙잡지 않게 */
const FONT_BUDGET_MS = 3000;
/** 같은 글자 조합은 하루 동안 다시 받지 않는다 */
const FONT_REVALIDATE_SECONDS = 86400;

export async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  const signal = AbortSignal.timeout(FONT_BUDGET_MS);
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const cssResponse = await fetch(cssUrl, { next: { revalidate: FONT_REVALIDATE_SECONDS }, signal });
    if (!cssResponse.ok) return null;
    // UA 없는 서버 요청에는 truetype/opentype을 준다 (satori는 woff2를 못 읽는다)
    const fontUrl = (await cssResponse.text()).match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!fontUrl) return null;
    const fontResponse = await fetch(fontUrl, { next: { revalidate: FONT_REVALIDATE_SECONDS }, signal });
    return fontResponse.ok ? await fontResponse.arrayBuffer() : null;
  } catch {
    return null;
  }
}
