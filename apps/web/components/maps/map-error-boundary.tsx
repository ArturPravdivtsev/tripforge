"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type MapErrorBoundaryProps = Readonly<{
  children: ReactNode;
  fallback: ReactNode;
}>;

type MapErrorBoundaryState = Readonly<{ failed: boolean }>;

export class MapErrorBoundary extends Component<
  MapErrorBoundaryProps,
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Trip map failed to render", error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
