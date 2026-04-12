"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  children: ReactNode;
  customerMode?: boolean;
};

type State = {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
};

export class ArtifactErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { customerMode } = this.props;
    const { error, showDetails } = this.state;

    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle size={14} className="text-amber-500/70" />
          <span className="text-xs font-medium text-foreground/70">
            This card couldn&apos;t render
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The text response below has the same information.
        </p>
        {!customerMode && (
          <div className="mt-2">
            <button
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors flex items-center gap-1"
            >
              {showDetails ? "Hide" : "Show"} details
              {showDetails ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
            {showDetails && error && (
              <pre className="mt-1.5 text-[10px] font-mono text-red-400/70 bg-background/50 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
                {error.message}
                {error.stack && "\n\n" + error.stack}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }
}
