import { Component } from 'react';

export class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1a1e] p-6 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-nf-red">Map failed to load</p>
          <p className="max-w-md text-sm text-white/70">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded-xl bg-nf-red px-4 py-2 text-xs font-bold uppercase tracking-wide text-white"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
