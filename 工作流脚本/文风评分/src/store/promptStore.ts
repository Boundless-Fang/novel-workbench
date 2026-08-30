import { createPersistStore } from "../services/storage/database";
import {
  PromptTemplate,
  createEmptyPrompt,
  DEFAULT_PROMPT_AVATAR,
} from "../types/prompt";
import { useSettingsStore } from "./settingsStore";
import { generateId } from "../utils/id";

export interface PromptState {
  prompts: Record<string, PromptTemplate>;
}

export const DEFAULT_PROMPT_STATE: PromptState = {
  prompts: {},
};

export const usePromptStore = createPersistStore(
  { ...DEFAULT_PROMPT_STATE },
  (set, get) => ({
    create(prompt?: Partial<PromptTemplate>) {
      const prompts = get().prompts;
      const id = generateId();
      prompts[id] = {
        ...createEmptyPrompt(),
        ...prompt,
        id,
        builtin: false,
      };
      set(() => ({ prompts }));
      get().markUpdate();
      return prompts[id];
    },
    updatePrompt(id: string, updater: (prompt: PromptTemplate) => void) {
      const prompts = get().prompts;
      const prompt = prompts[id];
      if (!prompt) return;
      const updated = { ...prompt };
      updater(updated);
      prompts[id] = updated;
      set(() => ({ prompts }));
      get().markUpdate();
    },
    remove(id: string) {
      const prompts = get().prompts;
      delete prompts[id];
      set(() => ({ prompts }));
      get().markUpdate();
    },
    get(id: string): PromptTemplate | undefined {
      return get().prompts[id];
    },
    getAll(projectId?: string): PromptTemplate[] {
      const all = Object.values(get().prompts);
      if (!projectId) return all.sort((a, b) => b.createdAt - a.createdAt);
      return all
        .filter((p) => p.scope === "global" || (p.scope === "project" && p.projectId === projectId))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    search(text: string, projectId?: string): PromptTemplate[] {
      const lower = text.toLowerCase();
      const all = Object.values(get().prompts).filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.description?.toLowerCase().includes(lower),
      );
      if (!projectId) return all;
      return all.filter((p) => p.scope === "global" || (p.scope === "project" && p.projectId === projectId));
    },
  }),
  {
    name: "inkflow-prompts",
    version: 2,
    migrate: (persisted: any, version: number) => {
      if (version < 2) {
        const state = persisted?.state || persisted;
        const prompts = state?.prompts || {};
        const migrated: Record<string, any> = {};
        for (const [id, p] of Object.entries(prompts)) {
          migrated[id] = { ...(p as any), scope: (p as any).scope || "global", projectId: (p as any).projectId || undefined };
        }
        return { ...persisted, state: { ...state, prompts: migrated } };
      }
      return persisted as any;
    },
  },
);
