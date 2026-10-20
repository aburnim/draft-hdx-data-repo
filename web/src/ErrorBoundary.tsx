import { Component, type ReactNode } from "react";

// Without a boundary, one thrown render (or a failed lazy import) unmounts the whole app
// and leaves a white page. This keeps the header and says what went wrong.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft p-4 text-[13px] text-ink">
        <b>Something failed to load.</b>
        <code className="whitespace-pre-wrap font-mono text-[12px] text-danger">{error.message}</code>
        <p className="text-ink-secondary">
          The details are in the browser console. Reloading may help; if it does not, the message above is what to report.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="self-start rounded border border-line-strong bg-white px-3 py-1 hover:bg-accent-soft"
        >
          Reload
        </button>
      </div>
    );
  }
}
