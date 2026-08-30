import { createPersistStore } from "../services/storage/database";
import { CheckerRule } from "../types/checker";
import { generateId } from "../utils/id";

export interface CheckerStoreState {
  rules: CheckerRule[];
}

const DEFAULT_RULES: CheckerRule[] = [];

export const useCheckerStore = createPersistStore(
  { rules: DEFAULT_RULES },
  (set, get) => ({
    addRule(rule: Omit<CheckerRule, "id">) {
      const newRule: CheckerRule = { ...rule, id: generateId() };
      set((s) => ({ rules: [...s.rules, newRule] }));
      get().markUpdate();
      return newRule;
    },
    updateRule(id: string, updater: (rule: CheckerRule) => void) {
      set((s) => ({
        rules: s.rules.map((r) => {
          if (r.id === id) {
            const updated = { ...r };
            updater(updated);
            return updated;
          }
          return r;
        }),
      }));
      get().markUpdate();
    },
    removeRule(id: string) {
      set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
      get().markUpdate();
    },
    toggleRule(id: string) {
      set((s) => ({
        rules: s.rules.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled } : r,
        ),
      }));
      get().markUpdate();
    },
  }),
  {
    name: "inkflow-checker",
    version: 1,
  },
);
