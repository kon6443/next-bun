'use client';

import { Component, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  /** 자식 컴포넌트 */
  children: ReactNode;
  /** 에러 발생 시 표시할 대체 UI (선택) */
  fallback?: ReactNode;
  /** 에러 발생 시 호출되는 콜백 (로깅 등) */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 에러 메시지 커스터마이징 */
  errorMessage?: string;
  /** 재시도 버튼 표시 여부 */
  showRetry?: boolean;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * 에러 바운더리 컴포넌트
 * 
 * React 컴포넌트 트리에서 발생한 에러를 잡아서 전체 앱 크래시를 방지합니다.
 * 에러가 발생한 컴포넌트 대신 대체 UI를 표시합니다.
 * 
 * @example
 * <ErrorBoundary fallback={<p>오류 발생</p>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * 
 * @example
 * <ErrorBoundary onError={(error) => logErrorToService(error)}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 다음 렌더링에서 fallback UI를 표시하도록 상태 업데이트
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 에러 로깅 콜백 호출
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // 콘솔에 에러 정보 출력
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 커스텀 fallback이 제공된 경우
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 에러 UI
      return (
        <div 
          className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="mb-3 text-3xl">⚠️</div>
          <h3 className="text-lg font-semibold text-red-400 mb-2">
            {this.props.errorMessage || '문제가 발생했습니다'}
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            {this.state.error?.message || '잠시 후 다시 시도해주세요.'}
          </p>
          {this.props.showRetry !== false && (
            <button
              onClick={this.handleRetry}
              className="rounded-full bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/30"
            >
              다시 시도
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 에러 바운더리 래퍼 (함수형 컴포넌트)
 * 
 * 간단한 사용을 위한 래퍼 컴포넌트입니다.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * 비동기 에러 표시용 컴포넌트
 * 
 * API 호출 등 비동기 작업에서 발생한 에러를 표시합니다.
 */
export function AsyncErrorFallback({
  error,
  onRetry,
  className = '',
}: {
  error: Error | string | null;
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div
      className={`rounded-2xl border border-red-500/30 bg-red-500/10 p-4 ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">{errorMessage}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs text-red-400/80 underline hover:text-red-400"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
