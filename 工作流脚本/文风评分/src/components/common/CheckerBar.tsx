import React from "react";
import type { CheckResult } from "../../types/checker";
import type { SlopReport } from "../../services/checker";
import { summarizeReport } from "../../services/checker";

interface CheckerBarProps {
  failedChecks: CheckResult[];
  toolSlopDetect: boolean;
  slopReport: SlopReport | null;
}

export function CheckerBar({ failedChecks, toolSlopDetect, slopReport }: CheckerBarProps) {
  return (
    <>
      {failedChecks.length > 0 && (
        <div style={{ padding: "4px 12px", fontSize: 11, color: "#f39c12", background: "#1a1a0a", borderBottom: "1px solid #333", flexShrink: 0 }}>
          {failedChecks.map((r) => r.message).join("  |  ")}
        </div>
      )}
      {toolSlopDetect && slopReport && (() => {
        const summary = summarizeReport(slopReport);
        const color = summary.score >= 7 ? "#27ae60" : summary.score >= 5 ? "#f39c12" : "#e74c3c";
        const repInfo = summary.repetitionDeduction > 0
          ? ` 重复${summary.repetitionLevel}(${(summary.repetitionRate * 100).toFixed(0)}%扣${summary.repetitionDeduction}分)`
          : "";
        return (
          <div style={{ padding: "6px 12px", fontSize: 12, background: "#111", borderBottom: "1px solid #333", flexShrink: 0 }}>
            <span style={{ color, fontWeight: 700 }}>
              文风评分 {summary.score}/10 {summary.grade}{repInfo}
            </span>
            {summary.topIssues.length > 0 && (
              <span style={{ color: "#888", marginLeft: 8, fontSize: 11 }}>
                {summary.topIssues[0]}
              </span>
            )}
          </div>
        );
      })()}
    </>
  );
}
