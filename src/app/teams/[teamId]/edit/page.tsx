'use client';

import { use, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { updateTeam, getTeamTasks } from '@/services/teamService';
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  Input,
  TextArea,
  SectionLabel,
  ErrorAlert,
  FormPageSkeleton,
} from '../../components';
import { cardStyles } from '@/styles/teams';
import { useTeamId, useAuthenticatedFetch, useAsyncOperation } from '@/app/hooks';

type EditTeamPageProps = {
  params: Promise<{ teamId: string }>;
};

export default function EditTeamPage({ params }: EditTeamPageProps) {
  const { teamId } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const { teamIdNum, isValid: isTeamIdValid, error: teamIdError } = useTeamId(teamId);

  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');

  // 팀 정보 로드
  const fetchTeamInfo = useCallback(
    async (accessToken: string) => {
      if (!isTeamIdValid) {
        throw new Error(teamIdError || '유효하지 않은 팀 ID입니다.');
      }
      const response = await getTeamTasks(teamIdNum, accessToken);
      return response.data.team;
    },
    [teamIdNum, isTeamIdValid, teamIdError],
  );

  const { isLoading, error: fetchError } = useAuthenticatedFetch(fetchTeamInfo, {
    enabled: isTeamIdValid,
    onSuccess: team => {
      setTeamName(team.teamName);
      setTeamDescription(team.teamDescription || '');
    },
  });

  // 폼 제출 처리
  const submitOperation = useAsyncOperation<void>({
    defaultErrorMessage: '팀 수정에 실패했습니다.',
    onSuccess: () => {
      router.push(`/teams/${teamId}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isTeamIdValid) {
      return;
    }

    if (!teamName.trim() || !teamDescription.trim()) {
      return;
    }

    if (!session?.user?.accessToken) {
      return;
    }

    await submitOperation.execute(async () => {
      await updateTeam(
        teamIdNum,
        {
          teamName: teamName.trim(),
          teamDescription: teamDescription.trim(),
        },
        session.user.accessToken,
      );
    });
  };

  // 에러 통합 (팀 ID 에러, 페치 에러, 제출 에러)
  const error = teamIdError || fetchError || submitOperation.error;

  if (isLoading) {
    return (
      <TeamsPageLayout maxWidth='4xl'>
        <FormPageSkeleton />
      </TeamsPageLayout>
    );
  }

  return (
    <TeamsPageLayout maxWidth='4xl'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <ButtonLink href={`/teams/${teamId}`} variant='secondary'>
          ← 팀 상세로 돌아가기
        </ButtonLink>
      </div>

      {/* 팀 수정 폼 */}
      <section className={`${cardStyles.section} p-4 sm:p-6 md:p-8`}>
        <div className='mb-4 sm:mb-6'>
          <SectionLabel>Edit Team</SectionLabel>
          <h1 className='mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-white md:text-5xl'>팀 수정</h1>
        </div>

        {error && <ErrorAlert message={error} className='mb-4 sm:mb-6' />}

        <form onSubmit={handleSubmit} className='space-y-4 sm:space-y-6'>
          <Input
            id='teamName'
            label='팀 이름'
            required
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder='팀 이름을 입력하세요'
            disabled={submitOperation.isLoading}
          />

          <TextArea
            id='teamDescription'
            label='팀 설명'
            required
            value={teamDescription}
            onChange={e => setTeamDescription(e.target.value)}
            placeholder='팀에 대한 상세 설명을 입력하세요'
            disabled={submitOperation.isLoading}
          />

          <div className='flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-2 sm:pt-4'>
            <ButtonLink href={`/teams/${teamId}`} variant='secondary'>
              취소
            </ButtonLink>
            <Button
              type='submit'
              disabled={submitOperation.isLoading || !teamName.trim() || !teamDescription.trim() || !isTeamIdValid}
            >
              {submitOperation.isLoading ? '수정 중...' : '팀 수정'}
            </Button>
          </div>
        </form>
      </section>
    </TeamsPageLayout>
  );
}
