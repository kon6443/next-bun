import { NextResponse } from "next/server";

export async function GET() {
  console.log("[/next-api/test] API Route가 서버에서 실행");

  // 서버 로그에 변수 값을 출력하여 OCI 인스턴스 터미널에서도 확인할 수 있습니다.
  console.log("TEST: ", process.env.TEST);
  console.log("test2:", process.env.TEST2);
  console.log("NEXT_PUBLIC_TEST: ", process.env.NEXT_PUBLIC_TEST);

  // 브라우저에 JSON 형태로 결과를 반환합니다.
  return NextResponse.json({
    message: "서버 환경변수 테스트 API",
    note: "이 데이터는 100% 서버에서 생성되었습니다.",
    server_variable: {
      name: "TEST",
      value: process.env.TEST,
      comment: "런타임 시점에 서버에 주입되는 변수입니다.",
    },
    server_variable2: {
      name: "TEST2",
      value: process.env.TEST2,
      comment: "런타임 시점에 서버에 주입되는 변수입니다.",
    },
    build_variable: {
      name: "NEXT_PUBLIC_TEST",
      value: process.env.NEXT_PUBLIC_TEST,
      comment: "빌드 시점에 코드에 삽입되는 공개용 변수입니다.",
    },
  });
}
