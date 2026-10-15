/**
 * JSON-LD를 <script type="application/ld+json"> 안에 넣을 문자열로 직렬화
 *
 * JSON.stringify는 `<`를 그대로 두므로 값에 `</script>`가 섞이면 스크립트 태그가 닫혀 HTML이 주입된다.
 * `<`를 유니코드 이스케이프로 바꾸면 JSON 의미는 같고 태그는 닫히지 않는다.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
