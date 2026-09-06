import { useMemo } from "react";
import { useCheckerStore } from "../store/checkerStore";
import { runCheck } from "../services/checker";
import type { CheckerType, CheckResult } from "../types/checker";

export function useChecker(text: string) {
  const rules = useCheckerStore((s) => s.rules);

  const results = useMemo(() => {
    const enabledRules = rules.filter((r) => r.enabled);
    return enabledRules.map((r) => runCheck(text, r.type));
  }, [text, rules]);

  const allPassed = results.every((r) => r.passed);
  const failedResults = results.filter((r) => !r.passed);

  return { results, allPassed, failedResults };
}
