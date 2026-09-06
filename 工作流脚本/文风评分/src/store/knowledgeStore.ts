import { createPersistStore } from "../services/storage/database";
import { KnowledgeItem } from "../types/knowledge";
import { generateId } from "../utils/id";

export interface KnowledgeStoreState {
  items: KnowledgeItem[];
}

const initialState: KnowledgeStoreState = { items: [] };

export const useKnowledgeStore = createPersistStore(
  initialState,
  (set, get) => ({
    addItem(item: Omit<KnowledgeItem, "id" | "createdAt" | "updatedAt">) {
      const now = Date.now();
      const newItem: KnowledgeItem = {
        ...item,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ items: [...s.items, newItem] }));
      get().markUpdate();
      return newItem;
    },
    updateItem(id: string, data: Partial<KnowledgeItem>) {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, ...data, updatedAt: Date.now() } : i,
        ),
      }));
      get().markUpdate();
    },
    removeItem(id: string) {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      get().markUpdate();
    },
    getByCategory(category: string, projectId?: string): KnowledgeItem[] {
      return get().items.filter((i) =>
        i.category === category &&
        (i.scope === "global" || (i.scope === "project" && i.projectId === projectId))
      );
    },
    searchItems(query: string, projectId?: string): KnowledgeItem[] {
      const lower = query.toLowerCase();
      return get().items.filter(
        (i) =>
          (i.title.toLowerCase().includes(lower) ||
           i.content.toLowerCase().includes(lower)) &&
          (i.scope === "global" || (i.scope === "project" && i.projectId === projectId)),
      );
    },
  }),
  {
    name: "inkflow-knowledge",
    version: 2,
    migrate: (persisted: any, version: number) => {
      if (version < 2) {
        const state = persisted?.state || persisted;
        return {
          ...persisted,
          state: {
            ...state,
            items: (state.items || []).map((item: any) => ({
              ...item,
              scope: item.scope || "global",
              projectId: item.projectId || undefined,
            })),
          },
        };
      }
      return persisted as any;
    },
  },
);
