import fetchServiceInstance from '@/services/FetchService';

export async function getMypage() {
  const endpoint = '/api/v2/mypage';
  await fetchServiceInstance.backendFetch({
    method: 'GET',
    endpoint,
    headers: { temp: 'kk', temp2: 'kk2k2k2k2k2' },
  });
}
