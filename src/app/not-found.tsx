import { ErrorPageLayout } from './components/ErrorPageLayout';

export default function NotFound() {
  return (
    <ErrorPageLayout
      title="404"
      titleColor="text-indigo-400"
      subtitle="페이지를 찾을 수 없습니다"
      description="요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다."
      buttonText="홈으로 돌아가기"
      href="/"
    />
  );
}
