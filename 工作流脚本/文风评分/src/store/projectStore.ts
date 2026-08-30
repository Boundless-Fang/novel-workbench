import { createPersistStore } from "../services/storage/database";
import { Project } from "../types/project";
import { generateId } from "../utils/id";

export interface ProjectState {
  projects: Project[];
  currentProjectId: string;
}

const DEFAULT_PROJECT_ID = "default";

const DEFAULT_STATE: ProjectState = {
  projects: [
    { id: DEFAULT_PROJECT_ID, name: "默认项目", createdAt: Date.now(), updatedAt: Date.now() },
  ],
  currentProjectId: DEFAULT_PROJECT_ID,
};

export const useProjectStore = createPersistStore(
  { ...DEFAULT_STATE },
  (set, get) => ({
    currentProject(): Project | undefined {
      return get().projects.find((p) => p.id === get().currentProjectId);
    },

    selectProject(id: string) {
      if (get().projects.some((p) => p.id === id)) {
        set({ currentProjectId: id });
      }
    },

    createProject(name: string): Project {
      const now = Date.now();
      const project: Project = { id: generateId(), name: name.trim() || "新项目", createdAt: now, updatedAt: now };
      set((s) => ({ projects: [...s.projects, project], currentProjectId: project.id }));
      get().markUpdate();
      return project;
    },

    renameProject(id: string, name: string) {
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p)),
      }));
      get().markUpdate();
    },

    deleteProject(id: string) {
      const { projects, currentProjectId } = get();
      if (projects.length <= 1) return;
      const newProjects = projects.filter((p) => p.id !== id);
      const newCurrentId = currentProjectId === id ? newProjects[0]?.id || DEFAULT_PROJECT_ID : currentProjectId;
      set({ projects: newProjects, currentProjectId: newCurrentId });
      get().markUpdate();
    },
  }),
  { name: "inkflow-projects", version: 1 },
);
