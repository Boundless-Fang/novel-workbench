import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { ErrorBoundary } from "../components/common/ErrorBoundary";

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/*" element={<HomePage />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
