// CLI 对话 IPC 薄封装：绑定层只暴露原始命令，这里补齐会话配置读取
// （chat_agent_id / chat_agent_models 设置键）与探测结果的内存缓存。

import { Channel } from "@tauri-apps/api/core";
import { commands } from "./bindings";
import type { ChatEvent_Deserialize, ChatStartRequest, DetectedAgent_Serialize } from "./bindings";

export type ChatEvent = ChatEvent_Deserialize;
export type ChatChannel = Channel<ChatEvent>;
export { Channel };
export type { ChatStartRequest, DetectedAgent_Serialize as DetectedAgent };

/** 设置页负责写入的两个键；未配置时对话页给出引导。 */
export const CHAT_AGENT_ID_KEY = "chat_agent_id";
export const CHAT_AGENT_MODELS_KEY = "chat_agent_models";

export interface ChatCliConfig {
  agentId: string | null;
  model: string | null;
  reasoning: string | null;
}

/** 未在设置页选择对话 CLI 时抛出，UI 据此渲染"前往设置"引导。 */
export class ChatAgentNotConfiguredError extends Error {
  constructor() {
    super("尚未选择对话 CLI，请先到设置页配置");
    this.name = "ChatAgentNotConfiguredError";
  }
}

export async function loadChatCliConfig(): Promise<ChatCliConfig> {
  const rawId = await commands.getSettings(CHAT_AGENT_ID_KEY);
  const agentId = rawId?.trim() ? rawId.trim() : null;
  let model: string | null = null;
  let reasoning: string | null = null;
  if (agentId) {
    try {
      const raw = await commands.getSettings(CHAT_AGENT_MODELS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      const entry: unknown =
        parsed && typeof parsed === "object" ? Reflect.get(parsed, agentId) : undefined;
      if (entry && typeof entry === "object") {
        const modelValue: unknown = Reflect.get(entry, "model");
        const reasoningValue: unknown = Reflect.get(entry, "reasoning");
        model = typeof modelValue === "string" && modelValue ? modelValue : null;
        reasoning = typeof reasoningValue === "string" && reasoningValue ? reasoningValue : null;
      }
    } catch {
      // 配置 JSON 损坏时退回默认模型，不阻塞对话。
    }
  }
  return { agentId, model, reasoning };
}

let agentsCache: Promise<DetectedAgent_Serialize[]> | null = null;

/** 探测本机可用的 agent CLI；结果缓存一次，顶栏名称展示反复读取不重复扫盘。 */
export function chatDetectAgents(forceRescan = false): Promise<DetectedAgent_Serialize[]> {
  if (forceRescan || !agentsCache) agentsCache = commands.chatDetectAgents(forceRescan);
  return agentsCache;
}

export const chatStart = (req: ChatStartRequest, onEvent: ChatChannel) =>
  commands.chatStart(req, onEvent);

export const chatCancel = (conversationId: string) => commands.chatCancel(conversationId);
