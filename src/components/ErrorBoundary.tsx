import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-slate-800 bg-[#111827] rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-rose-400">Studio Panel Recovery</h2>
            <p className="text-sm text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-sm font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors"
            >
              Reload View
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
