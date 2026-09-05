import { create } from "zustand";
import type { JsonValue } from "../lib/bindings";
import {
  Channel,
  ChatAgentNotConfiguredError,
  chatCancel,
  chatStart,
  loadChatCliConfig,
  type ChatEvent,
} from "../lib/chat";
import { getErrorMessage } from "../lib/error";

export interface ChatToolCall {
  id: string;
  name: string;
  input: JsonValue;
  result?: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  tools: ChatToolCall[];
  status?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  agentId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  status?: string;
  error?: string;
  /** not_configured 时 UI 渲染"前往设置"引导而非普通错误。 */
  errorKind?: "not_configured" | "runtime";
}

export interface PendingFirstMessage {
  conversationId: string;
  message: string;
  includeSkillContext: boolean;
}

const DEFAULT_TITLE = "新对话";

function makeMessageId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

interface ChatState {
  conversations: Record<string, ChatConversation>;
  pendingFirstMessage: PendingFirstMessage | null;
  createConversation: () => string;
  ensureConversation: (id: string) => void;
  setPendingFirstMessage: (pending: PendingFirstMessage) => void;
  takePendingFirstMessage: (conversationId: string) => PendingFirstMessage | null;
  appendUserMessage: (conversationId: string, text: string) => void;
  startAssistantMessage: (conversationId: string) => void;
  applyEvent: (conversationId: string, event: ChatEvent) => void;
  setStreaming: (conversationId: string, streaming: boolean) => void;
  setError: (conversationId: string, message: string, kind?: ChatConversation["errorKind"]) => void;
  sendMessage: (
    conversationId: string,
    message: string,
    includeSkillContext: boolean,
  ) => Promise<void>;
  cancel: (conversationId: string) => void;
  reset: () => void;
}

function patchConversation(
  conversations: Record<string, ChatConversation>,
  id: string,
  patch: (conversation: ChatConversation) => ChatConversation,
) {
  const conversation = conversations[id];
  if (!conversation) return conversations;
  return { ...conversations, [id]: patch(conversation) };
}

function patchLastAssistant(
  conversation: ChatConversation,
  patch: (message: ChatMessage) => ChatMessage,
): ChatConversation {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    if (message.role !== "assistant") continue;
    const messages = conversation.messages.slice();
    messages[i] = patch(message);
    return { ...conversation, messages };
  }
  return conversation;
}

function lastAssistant(conversation: ChatConversation): ChatMessage | undefined {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    if (conversation.messages[i].role === "assistant") return conversation.messages[i];
  }
  return undefined;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: {},
  pendingFirstMessage: null,

  createConversation: () => {
    let id: string;
    try {
      id = crypto.randomUUID();
    } catch {
      id = `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    set((state) => ({
      conversations: {
        ...state.conversations,
        [id]: { id, title: DEFAULT_TITLE, agentId: null, messages: [], streaming: false },
      },
    }));
    return id;
  },

  ensureConversation: (id) => {
    if (get().conversations[id]) return;
    set((state) => ({
      conversations: {
        ...state.conversations,
        [id]: { id, title: DEFAULT_TITLE, agentId: null, messages: [], streaming: false },
      },
    }));
  },

  setPendingFirstMessage: (pending) => set({ pendingFirstMessage: pending }),

  takePendingFirstMessage: (conversationId) => {
    const pending = get().pendingFirstMessage;
    if (!pending || pending.conversationId !== conversationId) return null;
    set({ pendingFirstMessage: null });
    return pending;
  },

  appendUserMessage: (conversationId, text) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        error: undefined,
        errorKind: undefined,
        title:
          conversation.title === DEFAULT_TITLE && conversation.messages.length === 0
            ? text.length > 24
              ? `${text.slice(0, 24)}…`
              : text
            : conversation.title,
        messages: [
          ...conversation.messages,
          { id: makeMessageId(), role: "user", text, tools: [] },
        ],
      })),
    })),

  startAssistantMessage: (conversationId) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, conversationId, (conversation) => {
        const current = lastAssistant(conversation);
        // 同一条助手消息未收尾前不重复占位（CLI 可能在工具调用后继续输出）。
        if (current && conversation.streaming && !current.text && !current.tools.length) {
          return conversation;
        }
        return {
          ...conversation,
          messages: [
            ...conversation.messages,
            { id: makeMessageId(), role: "assistant", text: "", tools: [] },
          ],
        };
      }),
    })),

  applyEvent: (conversationId, event) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, conversationId, (conversation) => {
        switch (event.type) {
          case "status": {
            const next = { ...conversation, status: event.label };
            return patchLastAssistant(next, (message) => ({ ...message, status: event.label }));
          }
          case "text_delta":
            return patchLastAssistant(conversation, (message) => ({
              ...message,
              text: message.text + event.delta,
            }));
          case "thinking_delta":
            return patchLastAssistant(conversation, (message) => ({
              ...message,
              thinking: (message.thinking ?? "") + event.delta,
            }));
          case "tool_use":
            return patchLastAssistant(conversation, (message) => ({
              ...message,
              tools: [...message.tools, { id: event.id, name: event.name, input: event.input }],
            }));
          case "tool_result":
            return patchLastAssistant(conversation, (message) => {
              const index = message.tools.findIndex((tool) => tool.id === event.tool_use_id);
              if (index === -1) {
                return {
                  ...message,
                  tools: [
                    ...message.tools,
                    {
                      id: event.tool_use_id,
                      name: "工具调用",
                      input: null,
                      result: event.content,
                      isError: event.is_error,
                    },
                  ],
                };
              }
              const tools = message.tools.slice();
              tools[index] = { ...tools[index], result: event.content, isError: event.is_error };
              return { ...message, tools };
            });
          case "usage":
            return conversation;
          case "error":
            return {
              ...conversation,
              streaming: false,
              status: undefined,
              error: event.message,
              errorKind: "runtime",
            };
          case "done": {
            const failed = event.code != null && event.code !== 0;
            return {
              ...conversation,
              streaming: false,
              status: undefined,
              error:
                failed && !conversation.error
                  ? `对话进程异常退出（退出码 ${event.code}），可重试发送`
                  : conversation.error,
              errorKind: failed && !conversation.error ? "runtime" : conversation.errorKind,
            };
          }
          default:
            return conversation;
        }
      }),
    })),

  setStreaming: (conversationId, streaming) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        streaming,
        status: streaming ? conversation.status : undefined,
      })),
    })),

  setError: (conversationId, message, kind = "runtime") =>
    set((state) => ({
      conversations: patchConversation(state.conversations, conversationId, (conversation) => ({
        ...conversation,
        streaming: false,
        status: undefined,
        error: message,
        errorKind: kind,
      })),
    })),

  sendMessage: async (conversationId, message, includeSkillContext) => {
    const state = get();
    const conversation = state.conversations[conversationId];
    const text = message.trim();
    if (!conversation || !text || conversation.streaming) return;

    get().appendUserMessage(conversationId, text);
    get().setStreaming(conversationId, true);
    get().startAssistantMessage(conversationId);

    let config;
    try {
      config = await loadChatCliConfig();
    } catch (error) {
      get().setError(conversationId, getErrorMessage(error, "读取对话配置失败"));
      return;
    }
    if (!config.agentId) {
      const error = new ChatAgentNotConfiguredError();
      get().setError(conversationId, error.message, "not_configured");
      throw error;
    }

    const channel = new Channel<ChatEvent>();
    // Tauri Channel 的事件入口就是 onmessage 属性，不是 EventTarget。
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    channel.onmessage = (event) => get().applyEvent(conversationId, event);
    try {
      await chatStart(
        {
          conversation_id: conversationId,
          agent_id: config.agentId,
          message: text,
          model: config.model,
          reasoning: config.reasoning,
          include_skill_context: includeSkillContext,
        },
        channel,
      );
    } catch (error) {
      const current = get().conversations[conversationId];
      // Done/error 事件可能已经把错误写进会话；避免覆盖更具体的信息。
      if (current?.streaming || !current?.error) {
        get().setError(conversationId, getErrorMessage(error, "对话请求失败，请重试"));
      }
    } finally {
      const current = get().conversations[conversationId];
      if (current?.streaming) get().setStreaming(conversationId, false);
    }
  },

  cancel: (conversationId) => {
    void chatCancel(conversationId).catch(() => {});
  },

  reset: () => set({ conversations: {}, pendingFirstMessage: null }),
}));
