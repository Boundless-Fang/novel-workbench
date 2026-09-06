/**
 * 模板引擎 — 从 NextChat 的 fillTemplateWith 拷贝并精简
 * 支持变量: {{input}}, {{model}}, {{time}}, {{lang}} 等
 */

export interface TemplateVars {
  input: string;
  model?: string;
  time?: string;
  lang?: string;
  [key: string]: string | undefined;
}

export const DEFAULT_INPUT_TEMPLATE = "{{input}}";

const DEFAULT_SYSTEM_TEMPLATE = `
You are an AI writing assistant. Follow the user's instructions carefully.
Current model: {{model}}
Current time: {{time}}
`.trim();

/**
 * 用变量填充模板
 */
export function fillTemplate(
  template: string | undefined,
  vars: TemplateVars,
): string {
  let output = template || DEFAULT_INPUT_TEMPLATE;

  // 如果用户输入本身就以模板开头，避免重复
  if (vars.input.startsWith(output)) {
    output = "";
  }

  // 必须包含 {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  // 替换所有变量
  const defaultVars: Record<string, string> = {
    model: vars.model || "unknown",
    time: vars.time || new Date().toString(),
    lang: vars.lang || "zh",
  };

  Object.entries({ ...defaultVars, ...vars }).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value?.toString() || "");
  });

  return output;
}

/**
 * 填充系统提示词
 */
export function fillSystemTemplate(
  systemTemplate: string | undefined,
  vars: Omit<TemplateVars, "input">,
): string {
  const template = systemTemplate || DEFAULT_SYSTEM_TEMPLATE;
  return fillTemplate(template, { ...vars, input: "" }).replace(inputMarker, "").trim();
}

const inputMarker = /\{\{input\}\}/g;
