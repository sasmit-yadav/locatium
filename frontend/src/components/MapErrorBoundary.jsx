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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-ds-3 bg-ds-surface-sunken p-ds-6 text-center">
          <p className="text-ds-title text-ds-danger">Map failed to load</p>
          <p className="max-w-md text-ds-body text-ds-text-secondary">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded-ds-md bg-ds-accent px-ds-4 py-ds-2 text-ds-body-med text-ds-text-inverse transition hover:bg-ds-accent-hover focus-visible:outline-none focus-visible:shadow-ds-focus"
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
