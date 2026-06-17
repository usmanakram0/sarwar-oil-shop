import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App error boundary caught:', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 space-y-4 text-center">
              <h2 className="text-lg font-heading font-bold">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Your data is still saved on this device. Try again — no internet required.
              </p>
              {import.meta.env.DEV && this.state.errorMessage ? (
                <p className="text-xs text-destructive/80 font-mono break-all">
                  {this.state.errorMessage}
                </p>
              ) : null}
              <div className="flex gap-2 justify-center">
                <Button onClick={this.handleRetry}>Try again</Button>
                <Button variant="outline" onClick={() => window.location.assign('/')}>
                  Go to dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
