import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  componentDidUpdate(prev: ErrorBoundaryProps) {
    // Reset when the wrapped subtree's identity changes (e.g. user navigates
    // to a different tab) so a stale error from one view doesn't haunt the next.
    if (prev.label !== this.props.label && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-red-600">
                Something broke
              </p>
              <h3 className="mt-1 text-base font-semibold text-[#1A1A1A]">
                {this.props.label ? `“${this.props.label}” crashed.` : 'This view crashed.'}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[#6B6B6B]">
                The rest of the app is fine — switch tabs to keep working. Open the browser console
                for the full trace, then send the top line below to your engineer.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-white p-3 text-xs text-red-700 ring-1 ring-red-200">
                {this.state.error.name}: {this.state.error.message}
              </pre>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={this.reset}
                  className="inline-flex items-center rounded-md border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] shadow-sm hover:bg-[#FAF8F2]"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
