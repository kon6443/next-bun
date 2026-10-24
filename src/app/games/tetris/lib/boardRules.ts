/**
 * 싱글·대전 화면 코드가 함께 쓰는 판 규칙 (games-polish FE-57)
 * 원본은 대전 엔진(해시 고정·서버와 같은 규칙)에 있다 — 복제하면 규칙이 갈라질 수 있어 재노출만 한다
 * 화면 코드(lib/·components/)는 battle-engine 내부 파일 대신 여기서 가져온다
 */
export { isPerfectClear } from '../battle-engine/battle';
export { GARBAGE_CELL } from '../battle-engine/constants';
