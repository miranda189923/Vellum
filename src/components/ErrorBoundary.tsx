import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || "Something went wrong.";

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F0] p-4 text-center">
          <div className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-sm border border-[#E6E6E1]">
            <h2 className="text-2xl font-serif font-medium text-[#1A1A1A] mb-4">Oops!</h2>
            <p className="text-[#5A5A40] mb-6">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#5A5A40] text-white rounded-full font-medium hover:bg-[#4A4A30] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
