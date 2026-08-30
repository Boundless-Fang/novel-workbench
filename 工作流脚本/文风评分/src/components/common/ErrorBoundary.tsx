import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] 捕获到渲染错误:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "#111", color: "#ccc", padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
          <h2 style={{ margin: 0, marginBottom: 8 }}>应用异常</h2>
          <p style={{ fontSize: 13, color: "#888", maxWidth: 280, marginBottom: 20 }}>
            {this.state.error?.message || "未知错误"}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: "#5a3a8a", color: "#fff", fontSize: 14, cursor: "pointer",
            }}
          >
            重试
          </button>
          <button
            onClick={() => {
              try { localStorage.clear(); } catch {}
              // idb-keyval 所有数据都存放在 keyval-store 这一个库中
              try { indexedDB.deleteDatabase("keyval-store"); } catch {}
              window.location.reload();
            }}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid #444",
              background: "transparent", color: "#e74c3c", fontSize: 12, cursor: "pointer", marginTop: 8,
            }}
          >
            清除数据并重启
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
