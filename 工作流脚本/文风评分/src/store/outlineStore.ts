import { createPersistStore } from "../services/storage/database";
import {
  OutlineConfig,
  OutlineGlobalConfig,
  OutlineModule,
  DEFAULT_OUTLINE_GLOBAL,
  STRUCTURE_TEMPLATE_MODULES,
} from "../types/outline";
import { generateId } from "../utils/id";

export interface OutlineStoreState {
  config: OutlineConfig;
}

const DEFAULT_CONFIG: OutlineConfig = {
  enabled: false,
  global: { ...DEFAULT_OUTLINE_GLOBAL },
  modules: [],
};

export const useOutlineStore = createPersistStore(
  { config: { ...DEFAULT_CONFIG } },
  (set, get) => ({
    setEnabled(enabled: boolean) {
      set((s) => ({ config: { ...s.config, enabled } }));
      get().markUpdate();
    },

    updateGlobal(updater: (global: OutlineGlobalConfig) => void) {
      set((s) => {
        const next = { ...s.config, global: { ...s.config.global } };
        updater(next.global);
        return { config: next };
      });
      get().markUpdate();
    },

    addModule() {
      set((s) => {
        const modules = [...s.config.modules];
        if (modules.length >= 10) return s;
        modules.push({
          id: generateId(),
          summary: "",
          functions: [],
          expressions: [],
          dialogue: "",
          required: false,
        });
        return { config: { ...s.config, modules } };
      });
      get().markUpdate();
    },

    applyTemplateModules(templateName: string) {
      const preset = STRUCTURE_TEMPLATE_MODULES[templateName];
      if (!preset) return;
      set((s) => ({
        config: {
          ...s.config,
          modules: preset.map((item) => ({
            id: generateId(),
            summary: item.name,
            functions: [],
            expressions: [],
            dialogue: "",
            required: item.required,
          })),
        },
      }));
      get().markUpdate();
    },

    removeModule(id: string) {
      set((s) => ({
        config: {
          ...s.config,
          modules: s.config.modules.filter((m) => m.id !== id),
        },
      }));
      get().markUpdate();
    },

    updateModule(id: string, updater: (mod: OutlineModule) => void) {
      set((s) => ({
        config: {
          ...s.config,
          modules: s.config.modules.map((m) => {
            if (m.id === id) {
              const next = { ...m };
              updater(next);
              return next;
            }
            return m;
          }),
        },
      }));
      get().markUpdate();
    },

    resetConfig() {
      set((s) => ({ config: { ...DEFAULT_CONFIG } }));
      get().markUpdate();
    },
  }),
  {
    name: "inkflow-outline",
    version: 1,
  },
);
