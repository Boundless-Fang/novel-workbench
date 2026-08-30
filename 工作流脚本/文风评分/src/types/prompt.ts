import { ChatMessage } from "./chat";
import { LLMConfig } from "./api";

// 从 NextChat masks/typing.ts + store/mask.ts 拷贝，重命名为 PromptTemplate
export type PromptTemplate = {
  id: string;
  createdAt: number;
  avatar: string;
  name: string;
  hideContext?: boolean;
  context: ChatMessage[];
  syncGlobalConfig?: boolean;
  modelConfig: Partial<LLMConfig>;
  builtin: boolean;
  description?: string;
  tags?: string[];
  category?: string;
  scope: "global" | "project";
  projectId?: string;
};

export const DEFAULT_PROMPT_AVATAR = "prompt";

export function createEmptyPrompt(): PromptTemplate {
  return {
    id: "",
    createdAt: Date.now(),
    avatar: DEFAULT_PROMPT_AVATAR,
    name: "",
    context: [],
    syncGlobalConfig: true,
    modelConfig: {},
    builtin: false,
    scope: "global",
  };
}
