import { Component } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { IconButton } from '../ui/IconButton';

interface ErrorBoundaryProps {
  resetKey: string;
  children: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <EmptyState icon={CircleAlert} label="Something went wrong">
          <IconButton icon={RotateCcw} label="Reload" onClick={() => window.location.reload()} />
        </EmptyState>
      </div>
    );
  }
}
