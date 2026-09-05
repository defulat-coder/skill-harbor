import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatEvent, ChatStartRequest } from "../lib/chat";
import { useChatStore } from "./useChatStore";

class FakeChannel {
  onmessage: ((event: ChatEvent) => void) | null = null;
}

const chatStart = vi.fn<(req: ChatStartRequest, channel: FakeChannel) => Promise<null>>();
const chatCancel = vi.fn<(conversationId: string) => Promise<null>>();
const loadChatCliConfig =
  vi.fn<
    () => Promise<{ agentId: string | null; model: string | null; reasoning: string | null }>
  >();

vi.mock("../lib/chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/chat")>();
  class MockChannel {
    onmessage: ((event: ChatEvent) => void) | null = null;
  }
  return {
    ...original,
    Channel: MockChannel,
    chatStart: (req: ChatStartRequest, channel: FakeChannel) => chatStart(req, channel),
    chatCancel: (conversationId: string) => chatCancel(conversationId),
    loadChatCliConfig: () => loadChatCliConfig(),
  };
});

function emit(channel: FakeChannel, ...events: ChatEvent[]) {
  for (const event of events) channel.onmessage?.(event);
}

function seedStreaming() {
  const id = useChatStore.getState().createConversation();
  useChatStore.getState().appendUserMessage(id, "问题");
  useChatStore.getState().setStreaming(id, true);
  useChatStore.getState().startAssistantMessage(id);
  return id;
}

function assistant(id: string) {
  const conversation = useChatStore.getState().conversations[id];
  return conversation.messages[conversation.messages.length - 1];
}

beforeEach(() => {
  chatStart.mockReset();
  chatCancel.mockReset();
  loadChatCliConfig.mockReset();
  loadChatCliConfig.mockResolvedValue({ agentId: "claude", model: "sonnet", reasoning: null });
  chatCancel.mockResolvedValue(null);
  useChatStore.getState().reset();
});

describe("useChatStore 会话结构", () => {
  it("createConversation 铸造 id 并写入空会话", () => {
    const id = useChatStore.getState().createConversation();
    const conversation = useChatStore.getState().conversations[id];
    expect(id).toBeTruthy();
    expect(conversation.title).toBe("新对话");
    expect(conversation.messages).toEqual([]);
    expect(conversation.streaming).toBe(false);
  });

  it("ensureConversation 不覆盖已存在的会话", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().appendUserMessage(id, "你好");
    useChatStore.getState().ensureConversation(id);
    expect(useChatStore.getState().conversations[id].messages).toHaveLength(1);
  });

  it("appendUserMessage 用首条消息生成标题", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().appendUserMessage(id, "帮我看看有哪些代码检查技能");
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.title).toBe("帮我看看有哪些代码检查技能");
    expect(conversation.messages[0].role).toBe("user");
  });

  it("pendingFirstMessage 只能取一次且按会话匹配", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().setPendingFirstMessage({
      conversationId: id,
      message: "问点什么",
      includeSkillContext: true,
    });
    expect(useChatStore.getState().takePendingFirstMessage("别的会话")).toBeNull();
    expect(useChatStore.getState().pendingFirstMessage?.conversationId).toBe(id);
    expect(useChatStore.getState().takePendingFirstMessage(id)?.message).toBe("问点什么");
    expect(useChatStore.getState().takePendingFirstMessage(id)).toBeNull();
  });
});

describe("useChatStore.applyEvent 事件流", () => {
  it("text_delta 增量追加到助手消息", () => {
    const id = seedStreaming();
    const apply = useChatStore.getState().applyEvent;
    apply(id, { type: "text_delta", delta: "你好" });
    apply(id, { type: "text_delta", delta: "，世界" });
    expect(assistant(id).text).toBe("你好，世界");
  });

  it("thinking_delta 独立累积到 thinking", () => {
    const id = seedStreaming();
    const apply = useChatStore.getState().applyEvent;
    apply(id, { type: "thinking_delta", delta: "先想想" });
    apply(id, { type: "thinking_delta", delta: "再回答" });
    expect(assistant(id).thinking).toBe("先想想再回答");
    expect(assistant(id).text).toBe("");
  });

  it("tool_use 入列、tool_result 按 id 配对回填", () => {
    const id = seedStreaming();
    const apply = useChatStore.getState().applyEvent;
    apply(id, { type: "tool_use", id: "t1", name: "Read", input: { path: "/tmp/a" } });
    apply(id, { type: "tool_use", id: "t2", name: "Bash", input: { cmd: "ls" } });
    apply(id, { type: "tool_result", tool_use_id: "t2", content: "ok", is_error: false });
    apply(id, { type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true });
    const tools = assistant(id).tools;
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ id: "t1", name: "Read", result: "boom", isError: true });
    expect(tools[1]).toMatchObject({ id: "t2", result: "ok", isError: false });
  });

  it("tool_result 找不到配对时占位入列", () => {
    const id = seedStreaming();
    useChatStore
      .getState()
      .applyEvent(id, { type: "tool_result", tool_use_id: "lost", content: "x", is_error: false });
    expect(assistant(id).tools[0]).toMatchObject({ id: "lost", result: "x" });
  });

  it("status 更新状态行，done 收尾并清空状态", () => {
    const id = seedStreaming();
    const apply = useChatStore.getState().applyEvent;
    apply(id, { type: "status", label: "连接中…", session_id: null });
    expect(useChatStore.getState().conversations[id].status).toBe("连接中…");
    expect(assistant(id).status).toBe("连接中…");
    apply(id, { type: "done", code: 0 });
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.streaming).toBe(false);
    expect(conversation.status).toBeUndefined();
    expect(conversation.error).toBeUndefined();
  });

  it("error 记录错误并停止流式", () => {
    const id = seedStreaming();
    useChatStore
      .getState()
      .applyEvent(id, { type: "error", message: "额度不足", category: "rate_limited" });
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.error).toBe("额度不足");
    expect(conversation.streaming).toBe(false);
  });

  it("done 非零退出码且没有错误事件时给出兜底错误", () => {
    const id = seedStreaming();
    useChatStore.getState().applyEvent(id, { type: "done", code: 1 });
    expect(useChatStore.getState().conversations[id].error).toContain("退出码 1");
  });

  it("未知会话的事件被忽略", () => {
    expect(() =>
      useChatStore.getState().applyEvent("不存在", { type: "done", code: 0 }),
    ).not.toThrow();
  });
});

describe("useChatStore.sendMessage", () => {
  it("组请求、经 Channel 增量应用事件并在进程结束时收尾", async () => {
    let channel: FakeChannel | null = null;
    chatStart.mockImplementation(async (_req, ch) => {
      channel = ch;
      emit(
        ch,
        { type: "status", label: "连接中…", session_id: null },
        { type: "text_delta", delta: "答" },
        { type: "done", code: 0 },
      );
      return null;
    });
    const id = useChatStore.getState().createConversation();
    await useChatStore.getState().sendMessage(id, "  你好  ", true);
    expect(chatStart).toHaveBeenCalledTimes(1);
    const req = chatStart.mock.calls[0][0];
    expect(req).toMatchObject({
      conversation_id: id,
      agent_id: "claude",
      model: "sonnet",
      message: "你好",
      include_skill_context: true,
    });
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.streaming).toBe(false);
    expect(conversation.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conversation.messages[1].text).toBe("答");
    expect(channel).not.toBeNull();
  });

  it("流式期间的并发发送被忽略", async () => {
    chatStart.mockImplementation(async () => null);
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().setStreaming(id, true);
    await useChatStore.getState().sendMessage(id, "第二条", false);
    expect(chatStart).not.toHaveBeenCalled();
    expect(useChatStore.getState().conversations[id].messages).toHaveLength(0);
  });

  it("未配置 agent 时抛 ChatAgentNotConfiguredError 并标记引导错误", async () => {
    loadChatCliConfig.mockResolvedValue({ agentId: null, model: null, reasoning: null });
    const id = useChatStore.getState().createConversation();
    await expect(useChatStore.getState().sendMessage(id, "你好", true)).rejects.toMatchObject({
      name: "ChatAgentNotConfiguredError",
    });
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.errorKind).toBe("not_configured");
    expect(conversation.streaming).toBe(false);
    expect(chatStart).not.toHaveBeenCalled();
  });

  it("chatStart 拒绝时把错误写进会话", async () => {
    chatStart.mockRejectedValue(new Error("spawn failed"));
    const id = useChatStore.getState().createConversation();
    await useChatStore.getState().sendMessage(id, "你好", true);
    const conversation = useChatStore.getState().conversations[id];
    expect(conversation.error).toContain("spawn failed");
    expect(conversation.errorKind).toBe("runtime");
    expect(conversation.streaming).toBe(false);
  });

  it("cancel 调用后端取消命令", () => {
    const id = useChatStore.getState().createConversation();
    useChatStore.getState().cancel(id);
    expect(chatCancel).toHaveBeenCalledWith(id);
  });
});
