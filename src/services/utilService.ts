// import { stringify } from "querystring";
import fetchServiceInstance from '@/services/FetchService';

export async function postKakaoSignInUp({
  kakaoNickname,
  accessToken,
  refreshToken,
}: {
  kakaoNickname: string;
  accessToken: string;
  refreshToken: string;
}): Promise<{ message: string; userId: number }> {
  const endpoint = '/api/v1/auth/kakao';
  const response = await fetch(`${process.env.NEXT_PUBLIC_API}${endpoint}`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kakaoNickname, accessToken, refreshToken }),
  });
  if (response.status !== 200) {
    throw new Error('LOGIN FAILED');
  }
  const data = await response.json();
  // const query = join(params ?? {}, '&');
  // const url = createEndPoint(endPoint, query);
  // const res = await httpServerSSR({ url, method: "post" });
  return data;
}

export async function getMypage() {
  const endpoint = '/api/v2/mypage';
  await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint,
    headers: { temp: 'kk', temp2: 'kk2k2k2k2k2' },
  });
}
