export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  category?: string;
  scope: "global" | "project";
  projectId?: string;
}

export interface KnowledgeState {
  items: KnowledgeItem[];
}
