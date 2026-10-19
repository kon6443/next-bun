'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { TeamTag } from '@/app/types/task';
import {
  getTeamTags,
  createTeamTag,
  updateTeamTag,
  deleteTeamTag,
  reorderTeamTags,
  type UpdateTeamTagRequest,
} from '@/services/teamService';
import { useTeamSocketEvents } from '@/app/hooks/useTeamSocketEvents';
import { applyTagOrder } from '@/app/utils/tagUtils';
import type { TagCreatedPayload, TagUpdatedPayload, TagDeletedPayload, TagsReorderedPayload } from '@/types/socket';
import { useTeamSocketContext } from './TeamSocketContext';

interface TeamTagsContextValue {
  /** 팀 태그 (팀 정렬 순서). 아직 못 받았거나 조회에 실패했으면 null */
  tags: TeamTag[] | null;
  /** 목록 반영을 기다리는 조회(refresh)가 있다 — 무효가 돼 다시 조회하는 동안에도 true */
  isLoading: boolean;
  /** 조회할 수 있는지(로그인 토큰 있음) — 하드 로드 직후 첫 렌더에는 세션이 아직 없다 */
  canFetch: boolean;
  /** 순서 변경 요청이 진행 중 — 그동안 다음 드래그를 막는다(요청이 겹치면 먼저 온 응답이 나중 반영을 되돌린다) */
  isReordering: boolean;
  /**
   * 서버 목록으로 다시 맞춘다 (taskCount 갱신 포함)
   * 조회 결과가 실제로 목록에 반영됐을 때 true. 동시에 부르면 같은 조회를 기다린다(GET 1회).
   * 조회 중 목록이 바뀌어 결과가 무효가 되면 다시 조회하고, 최대 횟수를 넘기거나 실패·토큰 없음이면 false
   * fresh: 진행 중 조회에 합류하지 않고, 그것이 끝난 뒤 새로 읽는다 — 이 호출 전에 읽기 시작한 결과로는 판단하면 안 될 때
   */
  refresh: (options?: { fresh?: boolean }) => Promise<boolean>;
  /** 실패하면 ApiError를 던진다 — 안내는 호출부가 한다 */
  createTag: (tagName: string, tagColor: string) => Promise<TeamTag>;
  updateTag: (tagId: number, request: UpdateTeamTagRequest) => Promise<TeamTag>;
  deleteTag: (tagId: number) => Promise<void>;
  /**
   * 순서 변경 — 화면에 먼저 반영하고, 실패하면(409 포함) 이전 순서로 되돌린 뒤 서버 목록을 다시 받는다
   * 실패 안내는 호출부가 한다 (에러를 그대로 던진다)
   */
  reorderTags: (tagIds: number[]) => Promise<void>;
}

const TeamTagsContext = createContext<TeamTagsContextValue | null>(null);

/** 조회 결과가 계속 무효가 될 때 다시 읽는 최대 횟수 — 끝없는 재조회를 막는다 */
const MAX_REFRESH_ATTEMPTS = 3;

interface TeamTagsProviderProps {
  children: ReactNode;
  teamId: number;
}

/**
 * 팀 태그 Provider
 *
 * teams/[teamId] 레이아웃에서 TeamSocketProvider 안쪽에 둔다.
 * 보드·태스크 상세·태스크 생성이 같은 태그 목록을 쓰고, 다른 팀원의 태그 변경은 소켓으로 반영된다.
 * 태스크 칩은 이 목록 기준으로 이름·색·순서를 맞춘다 (tagUtils.resolveTaskTags) — 태그 변경 때 태스크를 고칠 필요가 없다.
 */
export function TeamTagsProvider({ children, teamId }: TeamTagsProviderProps) {
  const { data: session } = useSession();
  const accessToken = session?.user?.accessToken;
  const { socket, roomJoinCount } = useTeamSocketContext();

  const [tags, setTags] = useState<TeamTag[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  /**
   * 목록 버전 — 목록을 바꾸는 반영(생성·수정·삭제·순서 변경 성공, 소켓 태그 이벤트 4종)마다 올린다.
   * 읽기 결과(GET 응답, 순서 변경 PUT 응답)는 읽기를 시작한 뒤 버전이 그대로일 때만 반영한다 —
   * 그사이 반영된 변경보다 먼저 읽힌 응답이 늦게 도착해 그 변경(새 태그·삭제·이름/색)을 되돌리지 않게
   */
  const listVersionRef = useRef(0);
  /**
   * 저장 대기 중인 순서 변경(tagIds) — 그동안 반영되는 조회 결과는 커밋 전 옛 순서일 수 있으니 이 순서를 씌운다.
   * 순서 변경은 isReordering으로 한 번에 하나만 진행된다
   */
  const pendingReorderRef = useRef<number[] | null>(null);
  /** 진행 중인 조회 — 동시에 부른 refresh가 함께 기다린다 */
  const inflightRefreshRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const markListChanged = useCallback(() => {
    listVersionRef.current += 1;
  }, []);

  const requireToken = useCallback(() => {
    const token = accessTokenRef.current;
    if (!token) throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    return token;
  }, []);

  /** 진행 중 조회가 있으면 합류, 없으면 새로 시작 */
  const startOrJoinRefresh = useCallback((): Promise<boolean> => {
    if (inflightRefreshRef.current) return inflightRefreshRef.current;
    const token = accessTokenRef.current;
    if (!token) return Promise.resolve(false);

    setIsLoading(true);
    const run = async () => {
      try {
        for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt += 1) {
          const startVersion = listVersionRef.current;
          const response = await getTeamTags(teamId, token);
          if (!mountedRef.current) return false;
          if (startVersion === listVersionRef.current) {
            const pendingOrder = pendingReorderRef.current;
            setTags(pendingOrder ? applyTagOrder(response.data, pendingOrder) : response.data);
            return true;
          }
          // 읽는 사이 목록이 바뀌었다 — 이 응답은 그 변경보다 오래됐으니 다시 읽는다
        }
        return false;
      } catch (err) {
        console.error('Failed to fetch team tags:', err);
        return false;
      } finally {
        inflightRefreshRef.current = null;
        if (mountedRef.current) setIsLoading(false);
      }
    };
    const promise = run();
    inflightRefreshRef.current = promise;
    return promise;
  }, [teamId]);

  const refresh = useCallback(
    (options?: { fresh?: boolean }): Promise<boolean> => {
      const inflight = inflightRefreshRef.current;
      if (inflight && options?.fresh) {
        // 진행 중 조회는 이 호출 전에 읽기 시작했을 수 있다 — 끝난 뒤 다시 읽는다.
        // 그사이 다른 곳이 새로 시작한 조회는 이 호출 뒤에 시작한 것이라 합류해도 된다
        return inflight.then(() => (mountedRef.current ? startOrJoinRefresh() : false));
      }
      return startOrJoinRefresh();
    },
    [startOrJoinRefresh],
  );

  // 첫 로드 · room 재참가(끊긴 동안 놓친 이벤트 보정)
  useEffect(() => {
    if (!accessToken) return;
    refresh();
  }, [accessToken, roomJoinCount, refresh]);

  const createTag = useCallback(
    async (tagName: string, tagColor: string) => {
      const response = await createTeamTag(teamId, { tagName, tagColor }, requireToken());
      const created = response.data;
      markListChanged();
      setTags(prev => (prev && !prev.some(t => t.tagId === created.tagId) ? [...prev, created] : prev));
      return created;
    },
    [teamId, requireToken, markListChanged],
  );

  const updateTag = useCallback(
    async (tagId: number, request: UpdateTeamTagRequest) => {
      const response = await updateTeamTag(teamId, tagId, request, requireToken());
      const updated = response.data;
      markListChanged();
      setTags(prev => prev?.map(t => (t.tagId === tagId ? updated : t)) ?? prev);
      return updated;
    },
    [teamId, requireToken, markListChanged],
  );

  const deleteTag = useCallback(
    async (tagId: number) => {
      await deleteTeamTag(teamId, tagId, requireToken());
      markListChanged();
      setTags(prev => prev?.filter(t => t.tagId !== tagId) ?? prev);
    },
    [teamId, requireToken, markListChanged],
  );

  const reorderTags = useCallback(
    async (tagIds: number[]) => {
      const previous = tagsRef.current;
      // 낙관적 반영도 목록 변경이다 — 진행 중인 조회는 이보다 오래됐으니 다시 읽게 된다
      markListChanged();
      const startVersion = listVersionRef.current;
      pendingReorderRef.current = tagIds;
      setTags(prev => (prev ? applyTagOrder(prev, tagIds) : prev));
      setIsReordering(true);
      try {
        const response = await reorderTeamTags(teamId, tagIds, requireToken());
        // 응답은 커밋 뒤 다시 읽은 목록이다. 그사이 다른 반영(소켓 등)이 있었으면 그 반영이 더 새로우니 버린다
        // (같은 탭의 tagsReordered가 먼저 와서 버려져도 순서는 같고, 순서 변경은 taskCount를 바꾸지 않는다)
        if (startVersion === listVersionRef.current) {
          markListChanged();
          setTags(response.data);
        }
      } catch (err) {
        // 그사이 다른 반영이 있었으면 되돌리지 않는다 — 아래 재조회가 맞춘다
        if (startVersion === listVersionRef.current) {
          markListChanged();
          setTags(previous);
        }
        refresh();
        throw err;
      } finally {
        if (pendingReorderRef.current === tagIds) pendingReorderRef.current = null;
        if (mountedRef.current) setIsReordering(false);
      }
    },
    [teamId, refresh, requireToken, markListChanged],
  );

  // ----- 소켓 태그 변경 — 본인 이벤트(다른 탭·이 탭의 HTTP 반영 뒤 도착)도 온다. 모두 멱등으로 반영한다 -----

  const handleTagCreated = useCallback(
    (payload: TagCreatedPayload) => {
      const { tagId, tagName, tagColor, sortOrder } = payload;
      markListChanged();
      setTags(prev =>
        prev && !prev.some(t => t.tagId === tagId) ? [...prev, { tagId, tagName, tagColor, sortOrder, taskCount: 0 }] : prev,
      );
    },
    [markListChanged],
  );

  const handleTagUpdated = useCallback(
    (payload: TagUpdatedPayload) => {
      const { tagId, tagName, tagColor, sortOrder } = payload;
      markListChanged();
      setTags(prev => prev?.map(t => (t.tagId === tagId ? { ...t, tagName, tagColor, sortOrder } : t)) ?? prev);
    },
    [markListChanged],
  );

  const handleTagDeleted = useCallback(
    (payload: TagDeletedPayload) => {
      markListChanged();
      setTags(prev => prev?.filter(t => t.tagId !== payload.tagId) ?? prev);
    },
    [markListChanged],
  );

  const handleTagsReordered = useCallback(
    (payload: TagsReorderedPayload) => {
      markListChanged();
      setTags(prev => (prev ? applyTagOrder(prev, payload.tagIds) : prev));
    },
    [markListChanged],
  );

  useTeamSocketEvents(
    socket,
    {
      onTagCreated: handleTagCreated,
      onTagUpdated: handleTagUpdated,
      onTagDeleted: handleTagDeleted,
      onTagsReordered: handleTagsReordered,
    },
    session?.user?.userId,
  );

  const canFetch = Boolean(accessToken);
  const value = useMemo<TeamTagsContextValue>(
    () => ({ tags, isLoading, canFetch, isReordering, refresh, createTag, updateTag, deleteTag, reorderTags }),
    [tags, isLoading, canFetch, isReordering, refresh, createTag, updateTag, deleteTag, reorderTags],
  );

  return <TeamTagsContext.Provider value={value}>{children}</TeamTagsContext.Provider>;
}

/** 팀 태그 Context — TeamTagsProvider 내부에서만 사용 가능 */
export function useTeamTagsContext(): TeamTagsContextValue {
  const context = useContext(TeamTagsContext);
  if (!context) {
    throw new Error('useTeamTagsContext must be used within a TeamTagsProvider (teams/[teamId] layout).');
  }
  return context;
}

/** Provider 밖(공용 컴포넌트)에서도 쓸 수 있는 버전 — 밖이면 null */
export function useTeamTagsContextOptional(): TeamTagsContextValue | null {
  return useContext(TeamTagsContext);
}
