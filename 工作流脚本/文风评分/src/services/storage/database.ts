import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";
import { create } from "zustand";
import { combine, persist, createJSONStorage } from "zustand/middleware";
import { deepClone } from "../../utils/text";

// ============ IndexedDB Storage — 从 NextChat utils/indexedDB-storage.ts 拷贝 ============

class IndexedDBStorage implements StateStorage {
  // 节流缓冲：流式输出期间每个 SSE chunk 都会触发一次 setItem，
  // 长回答会产生几千次完整 JSON 序列化 + IndexedDB 写入，导致
  // Android WebView 写入排队堆积、内存暴涨直至 OOM 崩溃。
  // 合并为 500ms 内仅执行一次实际写入，最后一次变更延迟落盘。
  private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingValues: Map<string, string> = new Map();

  public async getItem(name: string): Promise<string | null> {
    try {
      const value = (await get(name)) || localStorage.getItem(name);
      return value;
    } catch {
      return localStorage.getItem(name);
    }
  }

  public setItem(name: string, value: string): Promise<void> {
    this.pendingValues.set(name, value);
    const existing = this.writeTimers.get(name);
    if (existing) clearTimeout(existing);
    return new Promise<void>((resolve) => {
      const timer = setTimeout(async () => {
        const v = this.pendingValues.get(name) ?? "";
        this.pendingValues.delete(name);
        this.writeTimers.delete(name);
        await this.doWrite(name, v);
        resolve();
      }, 500);
      this.writeTimers.set(name, timer);
    });
  }

  private async doWrite(name: string, value: string): Promise<void> {
    try {
      const _value = JSON.parse(value);
      if (!_value?.state?._hasHydrated) {
        return;
      }
      await set(name, value);
    } catch {
      localStorage.setItem(name, value);
    }
  }

  public async removeItem(name: string): Promise<void> {
    const t = this.writeTimers.get(name);
    if (t) {
      clearTimeout(t);
      this.writeTimers.delete(name);
    }
    this.pendingValues.delete(name);
    try {
      await del(name);
    } catch {
      localStorage.removeItem(name);
    }
  }

  public async clearAll(): Promise<void> {
    for (const t of this.writeTimers.values()) clearTimeout(t);
    this.writeTimers.clear();
    this.pendingValues.clear();
    try {
      await clear();
    } catch {
      localStorage.clear();
    }
  }
}

export const indexedDBStorage = new IndexedDBStorage();

// ============ createPersistStore — 从 NextChat utils/store.ts 拷贝 ============

type SecondParam<T> = T extends (
  _f: infer _F,
  _s: infer S,
  ...args: infer _U
) => any
  ? S
  : never;

type MakeUpdater<T> = {
  lastUpdateTime: number;
  _hasHydrated: boolean;
  markUpdate: () => void;
  update: (updater: (state: T) => void) => void;
  setHasHydrated: (s: boolean) => void;
};

type SetStoreState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean,
) => void;

export function createPersistStore<T extends object, M>(
  state: T,
  methods: (
    set: SetStoreState<T & MakeUpdater<T>>,
    get: () => T & MakeUpdater<T>,
  ) => M,
  persistOptions: SecondParam<typeof persist<T & M & MakeUpdater<T>>>,
) {
  persistOptions.storage = createJSONStorage(() => indexedDBStorage);
  const oldOnRehydrate = persistOptions?.onRehydrateStorage;
  persistOptions.onRehydrateStorage = (s) => {
    oldOnRehydrate?.(s);
    return () => s.setHasHydrated(true);
  };

  return create(
    persist(
      combine(
        { ...state, lastUpdateTime: 0, _hasHydrated: false },
        (set, get) => ({
          ...methods(set, get as any),
          markUpdate() {
            set({ lastUpdateTime: Date.now() } as any);
          },
          update(updater: (state: T) => void) {
            const s = deepClone(get() as any);
            updater(s);
            set({ ...s, lastUpdateTime: Date.now() });
          },
          setHasHydrated(s: boolean) {
            set({ _hasHydrated: s } as any);
          },
        } as M & MakeUpdater<T>),
      ),
      persistOptions as any,
    ),
  );
}
