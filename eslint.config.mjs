import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// 디펜스 엔진 결정성 규칙(defense DESIGN §E1) — 백엔드 리플레이 검증과 같은 결과를 내야 하는 폴더 한정.
// 별칭(const M = Math)·globalThis·엔진 루트 밖 import 같은 우회는 engine-dev/tokenScan.test.ts가 잡는다
const DEFENSE_ENGINE_FILES = ["src/app/games/defense/engine/**/*.ts"];
const DEFENSE_ENGINE_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Math']:not([property.name=/^(imul|min|max|abs|floor|trunc)$/])",
    message: "엔진에서는 Math.imul·min·max·abs·floor·trunc만 쓴다 (§E1)",
  },
  { selector: "Literal[raw=/^[0-9]*\\.[0-9]|^[0-9.]+e/i]", message: "부동소수 리터럴 금지 (§E1)" },
  {
    selector:
      "BinaryExpression[operator='/']:not(CallExpression[callee.object.name='Math'][callee.property.name='floor'] > BinaryExpression)",
    message: "나눗셈은 Math.floor(a / b)로만 (§E1)",
  },
  { selector: "AssignmentExpression[operator='/=']", message: "/= 금지 — Math.floor(a / b) (§E1)" },
  { selector: "BinaryExpression[operator='**']", message: "** 금지 (§E1)" },
  { selector: "CallExpression[callee.property.name='sort'][arguments.length=0]", message: "비교 함수 없는 sort 금지 (§E1)" },
  { selector: "ImportDeclaration[source.value!=/^\\.\\.?\\//]", message: "엔진은 상대경로 import만 (외부 의존 금지, §E1)" },
  { selector: "ImportExpression", message: "동적 import 금지 (§E1)" },
  {
    selector: "ExportAllDeclaration[source.value!=/^\\.\\.?\\//], ExportNamedDeclaration[source][source.value!=/^\\.\\.?\\//]",
    message: "엔진은 상대경로 re-export만 (외부 의존 금지, §E1)",
  },
  { selector: "ForInStatement", message: "for…in 금지 — 키 순서 의존 (§E1)" },
  { selector: "Literal[regex]", message: "엔진에 정규식 리터럴 금지 — 토큰 스캔이 문자열 경계를 잃는다 (§E1)" },
  {
    selector: "ImportDeclaration[source.value=/(^|\\/)\\.[^./]/], ExportAllDeclaration[source.value=/(^|\\/)\\.[^./]/], ExportNamedDeclaration[source][source.value=/(^|\\/)\\.[^./]/]",
    message: "숨김 경로(.으로 시작하는 폴더·파일) import 금지 — 매니페스트·사본에서 빠진다 (§E0)",
  },
  { selector: "CallExpression[callee.property.name='sort'][arguments.0.type='UnaryExpression']", message: "비교 함수 없는 sort 금지 (§E1)" },
  { selector: "UnaryExpression[operator='+']", message: "단항 + 금지 — 문자열→수 암묵 변환 (§E1)" },
  { selector: "AssignmentExpression[operator='**=']", message: "**= 금지 (§E1)" },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='floor'][arguments.length!=1]",
    message: "Math.floor는 인자 1개로만 (§E1)",
  },
  { selector: "CallExpression[callee.name='Number'], MemberExpression[object.name='Number'][property.name=/^(EPSILON|MIN_VALUE)$/]", message: "Number() 변환·부동소수 상수 금지 (§E1)" },
  { selector: "MemberExpression[object.name='Object'][computed=true]", message: "Object 대괄호 접근 금지 (§E1)" },
  { selector: "CallExpression[callee.property.name='sort'][arguments.0.type='Identifier'][arguments.0.name='undefined']", message: "비교 함수 없는 sort 금지 (§E1)" },
  { selector: "MemberExpression[property.name='constructor']", message: "constructor 접근 금지 — 동적 코드 우회 (§E1)" },
  { selector: "CallExpression[callee.name=/^(parseFloat|parseInt)$/], MemberExpression[property.name=/^(parseFloat|toFixed|toPrecision)$/]", message: "부동소수 변환 금지 (§E1)" },
];
const DEFENSE_ENGINE_BITWISE = {
  selector: "BinaryExpression[operator=/^(\\||&|\\^|<<|>>|>>>)$/], AssignmentExpression[operator=/^(\\||&|\\^|<<|>>|>>>)=$/], UnaryExpression[operator='~']",
  message: "비트 연산은 random.ts(PRNG·해시)에서만 — 2³¹ 이상을 잘라먹는다 (§E1)",
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: DEFENSE_ENGINE_FILES,
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["Date", "performance", "Map", "Set", "WeakMap", "WeakSet", "window", "document", "globalThis", "JSON", "crypto"],
      ],
      "no-restricted-properties": [
        "error",
        { object: "Object", property: "keys" },
        { object: "Object", property: "values" },
        { object: "Object", property: "entries" },
      ],
      "no-restricted-syntax": ["error", ...DEFENSE_ENGINE_SYNTAX, DEFENSE_ENGINE_BITWISE],
    },
  },
  {
    files: ["src/app/games/defense/engine/random.ts"],
    rules: { "no-restricted-syntax": ["error", ...DEFENSE_ENGINE_SYNTAX] },
  },
];

export default eslintConfig;
