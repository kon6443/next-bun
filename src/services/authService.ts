export async function postKakaoSignInUp({
  kakaoNickname,
  accessToken,
  refreshToken,
}: {
  kakaoNickname: string;
  accessToken: string;
  refreshToken: string;
}): Promise<{ message: string; userId: number; loginType: "KAKAO" }> {
  const endPoint = "/api/v1/auth/kakao";
  
  // AbortController를 사용하여 timeout 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

  try {
    const url = `${process.env.NEXT_PUBLIC_API}${endPoint}`;
    
    // 디버깅용 로그 (필요시 주석 해제)
    // console.log("Request URL:", url);
    // console.log("Request body:", { kakaoNickname, accessToken: accessToken ? "***" : undefined, refreshToken: refreshToken ? "***" : undefined });
    
    const response = await fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kakaoNickname, accessToken, refreshToken }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // 디버깅용 로그 (필요시 주석 해제)
    // console.log("Response status:", response.status);
    // console.log("Response statusText:", response.statusText);
    // console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    
    // NestJS는 200-299 범위의 성공 상태 코드를 사용할 수 있음
    // 200 (OK), 201 (Created), 204 (No Content) 등을 허용
    if (!response.ok) {
      // 응답 본문을 먼저 읽어서 에러 메시지 확인
      let errorMessage = "LOGIN FAILED";
      try {
        const errorData = await response.text();
        console.error("Error response body:", errorData);
        if (errorData) {
          try {
            const parsedError = JSON.parse(errorData);
            errorMessage = parsedError.message || parsedError.error || errorMessage;
          } catch {
            errorMessage = errorData || errorMessage;
          }
        }
      } catch (parseError) {
        console.error("Failed to parse error response:", parseError);
      }
      throw new Error(`LOGIN FAILED: ${response.status} ${response.statusText} - ${errorMessage}`);
    }
    
    // 성공 응답 처리
    const contentType = response.headers.get("content-type");
    let data;
    
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      // JSON이 아닌 경우 텍스트로 읽기
      const text = await response.text();
      // console.warn("Response is not JSON, received text:", text);
      throw new Error("서버가 예상하지 못한 형식으로 응답했습니다.");
    }
    
    // 디버깅용 로그 (필요시 주석 해제)
    // console.log("Response data:", { ...data, userId: data.userId, loginType: data.loginType });
    
    // 응답 데이터 검증
    if (!data || typeof data.userId !== "number" || !data.loginType) {
      console.error("Invalid response data structure:", data);
      throw new Error("서버 응답 형식이 올바르지 않습니다.");
    }
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    }
    throw error;
  }
}
