// import { stringify } from "querystring";

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
  //   console.log("url:", `${process.env.NEXT_PUBLIC_API}${endPoint}`);
  //   const response = await fetch(`${"http://127.0.0.1:3500"}${endPoint}`, {
  console.log("api:", process.env.NEXT_PUBLIC_API);
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}${endPoint}`, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kakaoNickname, accessToken, refreshToken }),
  });
  if (response.status !== 200) {
    throw new Error("LOGIN FAILED");
  }
  const data = await response.json();
  // const query = join(params ?? {}, '&');
  // const url = createEndPoint(endPoint, query);
  // const res = await httpServerSSR({ url, method: "post" });
  return data;
}
