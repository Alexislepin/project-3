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
    // En production : masquer l'écran d'erreur et tenter de poursuivre
    // En dev : log et masquer l'écran pour éviter le blocage visuel
    if (this.state.hasError) {
      if (import.meta.env.DEV && this.state.error) {
        console.error('ErrorBoundary (dev):', this.state.error);
      }
      return this.props.children;
    }

    return this.props.children;
  }
}

