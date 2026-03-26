import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界：
 * 1) 捕获子组件渲染阶段的异常，防止整个页面白屏。
 * 2) 给用户展示可读的兜底信息，并提供“重试”按钮。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  /**
   * React 在子树抛错后会先调用这个静态方法，
   * 我们在这里把状态切到“错误态”，让 fallback UI 生效。
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * 这里用于记录详细错误信息（例如接入监控平台）。
   * 当前先输出到控制台，方便开发阶段排查。
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] 捕获到未处理渲染异常", error, errorInfo);
  }

  /**
   * 用户点击“重试”后，清掉错误态，重新渲染子组件。
   */
  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex h-screen items-center justify-center p-6 bg-notion-bg">
        <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-xl font-semibold text-red-300">应用发生错误</h1>
          <p className="mt-2 text-sm text-red-200/90 break-all">
            {this.state.error?.message ?? "未知错误"}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-5 rounded-lg border border-red-300/40 px-4 py-2 text-sm text-red-100 hover:bg-red-500/20 cursor-pointer"
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
