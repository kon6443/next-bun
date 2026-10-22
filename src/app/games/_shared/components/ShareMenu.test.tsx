// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ShareMenu } from './ShareMenu';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

const sendKakaoFeed = vi.fn();
vi.mock('../lib/kakao', () => ({ sendKakaoFeed: (...a: unknown[]) => sendKakaoFeed(...a) }));

// 게임별 문구는 각 게임의 공유 사양 테스트가 확인한다 — 여기서는 메뉴가 받은 내용을 그대로 쓰는지만
const content = {
  url: 'https://site/games/g/replays/7',
  title: '홍길동님의 기록',
  text: '홍길동님의 기록 (요약) — 리플레이 보기',
  kakao: { title: '홍길동님의 기록', description: '요약 — 리플레이로 플레이를 다시 보세요', imageUrl: 'https://site/games/g/replays/7/og' },
};

const setNavigator = (nav: Partial<Navigator>) => {
  vi.stubGlobal('navigator', { ...window.navigator, clipboard: undefined, share: undefined, ...nav });
};

describe('ShareMenu', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
    sendKakaoFeed.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('카카오 SDK가 준비되지 않으면 카카오톡을 숨기고, Web Share가 없으면 더보기를 숨긴다', () => {
    setNavigator({});
    render(<ShareMenu content={content} kakaoReady={false} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /카카오톡/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /더보기/ })).toBeNull();
    expect(screen.getByRole('button', { name: /링크 복사/ })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '리플레이 공유' })).toBeTruthy();
  });

  it('카카오톡: 기록 OG 이미지·리플레이 URL로 피드 카드', () => {
    setNavigator({});
    sendKakaoFeed.mockReturnValue(true);
    const onClose = vi.fn();
    render(<ShareMenu content={content} kakaoReady onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /카카오톡/ }));
    expect(sendKakaoFeed).toHaveBeenCalledWith({ ...content.kakao, url: content.url });
    expect(onClose).toHaveBeenCalled();
  });

  it('링크 복사: 성공 토스트·닫기 / 미지원·실패는 안내', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } as unknown as Clipboard });
    const onClose = vi.fn();
    render(<ShareMenu content={content} kakaoReady={false} onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /링크 복사/ }));
    });
    expect(writeText).toHaveBeenCalledWith(content.url);
    expect(toastSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('링크 복사 미지원(비보안 컨텍스트)이면 길게 눌러 복사 안내', async () => {
    setNavigator({});
    render(<ShareMenu content={content} kakaoReady={false} onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /링크 복사/ }));
    });
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('길게 눌러'));
  });

  it('더보기: 지원 시에만 보이고, 사용자 취소(AbortError)는 에러 토스트 없음', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    setNavigator({ share });
    const onClose = vi.fn();
    render(<ShareMenu content={content} kakaoReady={false} onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /더보기/ }));
    });
    expect(share).toHaveBeenCalledWith({ title: content.title, text: content.text, url: content.url });
    expect(toastError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc로 닫는다', () => {
    setNavigator({});
    const onClose = vi.fn();
    render(<ShareMenu content={content} kakaoReady={false} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
