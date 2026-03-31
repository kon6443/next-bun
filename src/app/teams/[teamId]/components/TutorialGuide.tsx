'use client';

import { useState, useCallback, useEffect } from 'react';
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from '@/app/components/Icons';

const TUTORIAL_STORAGE_KEY = 'teams-tutorial-shown';

type TutorialStep = {
  icon: string;
  title: string;
  description: string;
};

const STEPS: TutorialStep[] = [
  {
    icon: '👋',
    title: '팀 보드에 오신 걸 환영합니다!',
    description: '이 보드에서 팀의 태스크를 한눈에 관리할 수 있어요. 간단한 사용법을 알려드릴게요.',
  },
  {
    icon: '📋',
    title: '칸반 보드',
    description: '좌우로 스와이프하면 상태별 태스크를 볼 수 있어요. 상단 탭을 눌러도 이동할 수 있습니다.',
  },
  {
    icon: '➕',
    title: '태스크 생성',
    description: '오른쪽 하단의 + 버튼이나 헤더의 + 아이콘을 눌러 새 태스크를 만들어보세요.',
  },
  {
    icon: '🔄',
    title: '상태 변경과 댓글',
    description: '태스크 카드를 눌러 상세 페이지로 이동하세요. 상태 변경은 물론, 댓글을 남겨 팀원과 소통할 수 있어요.',
  },
  {
    icon: '🟢',
    title: '실시간 접속 현황',
    description: '헤더 오른쪽의 프로필 아이콘을 눌러보세요. 현재 접속 중인 팀원을 실시간으로 확인할 수 있어요.',
  },
  {
    icon: '👥',
    title: '팀 관리',
    description: '멤버 섹션에서 팀원 목록과 역할을 확인하고, 초대 링크를 생성해 새 팀원을 초대할 수 있어요.',
  },
  {
    icon: '🔔',
    title: '알림 연동',
    description: '팀 관리 섹션에서 Telegram 봇이나 Discord 웹훅을 연결하면, 태스크 변경 알림을 자동으로 받을 수 있어요.',
  },
  {
    icon: '🔍',
    title: '필터와 뷰',
    description: '검색, 담당자, 기간 등 다양한 필터로 태스크를 찾을 수 있어요. 칸반/리스트/간트/캘린더 뷰도 전환할 수 있습니다.',
  },
];

type TutorialGuideProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function TutorialGuide({ isOpen, onClose }: TutorialGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // 모달 닫힐 때 스텝 리셋
  useEffect(() => {
    if (!isOpen) setCurrentStep(0);
  }, [isOpen]);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  }, [currentStep, onClose]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="닫기"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* 스텝 콘텐츠 */}
        <div className="flex flex-col items-center text-center pt-2">
          {/* 아이콘 */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/80 border border-white/10 text-3xl mb-4">
            {step.icon}
          </div>

          {/* 스텝 카운터 */}
          <span className="text-xs text-slate-500 mb-2">
            {currentStep + 1} / {STEPS.length}
          </span>

          {/* 제목 */}
          <h3 className="text-lg font-bold text-white mb-2">
            {step.title}
          </h3>

          {/* 설명 */}
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            {step.description}
          </p>
        </div>

        {/* 네비게이션 */}
        <div className="flex items-center justify-between gap-3">
          {/* 이전 버튼 */}
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className={`flex items-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isFirst
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <ChevronLeftIcon className="w-4 h-4" />
            이전
          </button>

          {/* 스텝 인디케이터 */}
          <div className="flex gap-1.5">
            {STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  index === currentStep
                    ? 'w-4 bg-sky-500'
                    : 'w-1.5 bg-slate-600 hover:bg-slate-500'
                }`}
                aria-label={`스텝 ${index + 1}로 이동`}
              />
            ))}
          </div>

          {/* 다음/완료 버튼 */}
          <button
            onClick={handleNext}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-95"
          >
            {isLast ? '시작하기' : '다음'}
            {!isLast && <ChevronRightIcon className="w-4 h-4" />}
          </button>
        </div>

        {/* 건너뛰기 */}
        {!isLast && (
          <button
            onClick={onClose}
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  );
}

/** 튜토리얼을 이미 봤는지 확인 */
export function hasSeenTutorial(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
}

/** 튜토리얼을 봤다고 기록 + 구 스와이프 힌트 키 정리 */
export function markTutorialSeen(): void {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
  localStorage.removeItem('kanban-swipe-hint-shown');
}
