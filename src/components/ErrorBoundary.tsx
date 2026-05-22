import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#11140f',
            color: '#f4f7ef',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: 24
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>MYML Canvas could not render this view.</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: '#c8d1bd' }}>
              Refresh the page to recover. The original error has been logged in the console.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
