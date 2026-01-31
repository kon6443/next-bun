// ==================== API 응답 타입 ====================

/**
 * 성공 응답 타입
 */
export type ApiResponse<T> = {
  code: 'SUCCESS';
  data: T;
  message: string;
};

/**
 * 에러 응답 타입
 */
export type ApiErrorResponse = {
  code: string;
  message: string;
  timestamp: string;
};

// ==================== 에러 코드 타입 ====================

/**
 * 에러 코드 타입 (백엔드와 동일하게 유지)
 */
export type ErrorCode =
  // 공통 에러
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_GATEWAY'
  // Auth 에러
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_KAKAO_API_ERROR'
  // Team 에러
  | 'TEAM_NOT_FOUND'
  | 'TEAM_FORBIDDEN'
  | 'TEAM_TASK_NOT_FOUND'
  | 'TEAM_TASK_BAD_REQUEST'
  | 'TEAM_COMMENT_NOT_FOUND'
  | 'TEAM_COMMENT_FORBIDDEN'
  | 'TEAM_INVITE_NOT_FOUND'
  | 'TEAM_INVITE_EXPIRED'
  | 'TEAM_INVITE_FORBIDDEN'
  | 'TEAM_MEMBER_ALREADY_EXISTS'
  // Notification 에러
  | 'NOTIFICATION_TELEGRAM_CONFIG_ERROR'
  | 'NOTIFICATION_TELEGRAM_API_ERROR'
  | 'NOTIFICATION_TELEGRAM_LINK_INVALID'
  | 'NOTIFICATION_TELEGRAM_ALREADY_LINKED';

// ==================== 에러 코드별 메시지 매핑 ====================

export const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
  // 공통 에러
  VALIDATION_ERROR: '요청 값이 올바르지 않습니다.',
  NOT_FOUND: '리소스를 찾을 수 없습니다.',
  FORBIDDEN: '접근 권한이 없습니다.',
  UNAUTHORIZED: '인증이 필요합니다.',
  BAD_REQUEST: '잘못된 요청입니다.',
  INTERNAL_SERVER_ERROR: '서버 내부 오류가 발생했습니다.',
  BAD_GATEWAY: '외부 서비스 오류가 발생했습니다.',
  // Auth 에러
  AUTH_UNAUTHORIZED: '인증이 필요합니다. 다시 로그인해주세요.',
  AUTH_INVALID_TOKEN: '유효하지 않은 토큰입니다. 다시 로그인해주세요.',
  AUTH_KAKAO_API_ERROR: '카카오 인증에 실패했습니다.',
  // Team 에러
  TEAM_NOT_FOUND: '팀을 찾을 수 없습니다.',
  TEAM_FORBIDDEN: '팀에 접근할 권한이 없습니다.',
  TEAM_TASK_NOT_FOUND: '태스크를 찾을 수 없습니다.',
  TEAM_TASK_BAD_REQUEST: '태스크 요청이 올바르지 않습니다.',
  TEAM_COMMENT_NOT_FOUND: '댓글을 찾을 수 없습니다.',
  TEAM_COMMENT_FORBIDDEN: '댓글에 접근할 권한이 없습니다.',
  TEAM_INVITE_NOT_FOUND: '초대 링크를 찾을 수 없습니다.',
  TEAM_INVITE_EXPIRED: '만료된 초대 링크입니다.',
  TEAM_INVITE_FORBIDDEN: '초대 링크를 생성할 권한이 없습니다.',
  TEAM_MEMBER_ALREADY_EXISTS: '이미 팀 멤버입니다.',
  // Notification 에러
  NOTIFICATION_TELEGRAM_CONFIG_ERROR: '텔레그램 설정이 올바르지 않습니다.',
  NOTIFICATION_TELEGRAM_API_ERROR: '텔레그램 서비스 오류가 발생했습니다.',
  NOTIFICATION_TELEGRAM_LINK_INVALID: '유효하지 않은 텔레그램 연동 링크입니다.',
  NOTIFICATION_TELEGRAM_ALREADY_LINKED: '이미 텔레그램이 연동되어 있습니다.',
};

// ==================== API 에러 클래스 ====================

/**
 * API 에러 클래스
 * 에러 코드와 메시지를 포함하여 프론트엔드에서 세밀한 에러 처리 가능
 */
export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;
  readonly timestamp?: string;

  constructor(code: string, message: string, status: number, timestamp?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.timestamp = timestamp;
  }

  /**
   * 에러 코드에 해당하는 기본 메시지 반환
   */
  getDefaultMessage(): string {
    return ERROR_CODE_MESSAGES[this.code as ErrorCode] || this.message;
  }

  /**
   * 인증 관련 에러인지 확인
   */
  isAuthError(): boolean {
    return this.code.startsWith('AUTH_') || this.code === 'UNAUTHORIZED' || this.status === 401;
  }

  /**
   * 권한 관련 에러인지 확인
   */
  isForbiddenError(): boolean {
    return this.code.endsWith('_FORBIDDEN') || this.code === 'FORBIDDEN' || this.status === 403;
  }

  /**
   * 리소스 찾을 수 없음 에러인지 확인
   */
  isNotFoundError(): boolean {
    return this.code.endsWith('_NOT_FOUND') || this.code === 'NOT_FOUND' || this.status === 404;
  }

  /**
   * 팀 관련 에러인지 확인
   */
  isTeamError(): boolean {
    return this.code.startsWith('TEAM_');
  }

  /**
   * 알림 관련 에러인지 확인
   */
  isNotificationError(): boolean {
    return this.code.startsWith('NOTIFICATION_');
  }
}

/**
 * API 에러 응답에서 ApiError 인스턴스 생성
 */
export function createApiError(errorResponse: ApiErrorResponse, status: number): ApiError {
  return new ApiError(
    errorResponse.code,
    errorResponse.message,
    status,
    errorResponse.timestamp,
  );
}

// ==================== 유틸리티 함수 ====================

/**
 * 에러 코드가 유효한지 확인
 */
export function isValidErrorCode(code: string): code is ErrorCode {
  return code in ERROR_CODE_MESSAGES;
}

/**
 * 에러 코드에 해당하는 메시지 반환
 */
export function getErrorMessage(code: string, fallback?: string): string {
  if (isValidErrorCode(code)) {
    return ERROR_CODE_MESSAGES[code];
  }
  return fallback || '알 수 없는 오류가 발생했습니다.';
}
