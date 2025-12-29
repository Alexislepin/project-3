import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
    // Diagnostic: log mount
    console.log('[MOUNT]', 'ErrorBoundary');
  }

  componentWillUnmount() {
    // Diagnostic: log unmount
    console.log('[UNMOUNT]', 'ErrorBoundary');
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to error reporting service in production
    if (import.meta.env.PROD) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background-light flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card-light rounded-xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h2 className="text-xl font-semibold text-text-main-light">
                Une erreur s'est produite
              </h2>
            </div>
            
            <p className="text-text-sub-light mb-6">
              Désolé, quelque chose s'est mal passé. Veuillez rafraîchir la page ou réessayer plus tard.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-mono text-red-800 break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-primary text-black rounded-lg font-medium hover:brightness-95 transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Actualiser
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

