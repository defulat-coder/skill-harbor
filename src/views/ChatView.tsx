import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { MessageSquarePlus, Settings2, Terminal } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ChatComposer } from "../components/chat/ChatComposer";
import { ChatMessages } from "../components/chat/ChatMessages";
import { chatDetectAgents, loadChatCliConfig, type ChatCliConfig } from "../lib/chat";
import { useChatStore } from "../stores/useChatStore";
import styles from "./ChatView.module.css";

/** /chat：铸造新会话 id 并替换到 /chat/:id，地址栏始终指向具体会话。 */
export function ChatNewConversation() {
  const navigate = useNavigate();
  useEffect(() => {
    const id = useChatStore.getState().createConversation();
    void navigate({ to: "/chat/$conversationId", params: { conversationId: id }, replace: true });
  }, [navigate]);
  return null;
}

interface AgentDisplay {
  config: ChatCliConfig;
  name: string | null;
}

export function ChatView() {
  const { conversationId = "" } = useParams({ strict: false });
  const navigate = useNavigate();
  const conversation = useChatStore((state) => state.conversations[conversationId]);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const cancel = useChatStore((state) => state.cancel);
  const [agent, setAgent] = useState<AgentDisplay | null>(null);
  const [agentError, setAgentError] = useState("");
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) useChatStore.getState().ensureConversation(conversationId);
  }, [conversationId]);

  // 顶栏的 CLI 名称/模型只读一次：探测结果在 lib 层有缓存。
  useEffect(() => {
    let alive = true;
    loadChatCliConfig()
      .then(async (config) => {
        let name: string | null = null;
        if (config.agentId) {
          try {
            const agents = await chatDetectAgents();
            name = agents.find((item) => item.id === config.agentId)?.name ?? config.agentId;
          } catch {
            name = config.agentId;
          }
        }
        if (alive) setAgent({ config, name });
      })
      .catch(() => {
        if (alive) setAgentError("读取对话配置失败，请前往设置页检查");
      });
    return () => {
      alive = false;
    };
  }, []);

  // 首页带过来的首条消息：会话还没有任何消息时自动发送，每个会话只消费一次。
  const pendingConsumed = useRef<string | null>(null);
  const hasMessages = (conversation?.messages.length ?? 0) > 0;
  useEffect(() => {
    if (!conversationId || !conversation || hasMessages) return;
    if (pendingConsumed.current === conversationId) return;
    pendingConsumed.current = conversationId;
    const pending = useChatStore.getState().takePendingFirstMessage(conversationId);
    if (pending) {
      void useChatStore
        .getState()
        .sendMessage(conversationId, pending.message, pending.includeSkillContext)
        .catch(() => {});
    }
  }, [conversationId, conversation, hasMessages]);

  const streaming = conversation?.streaming ?? false;
  const messageCount = conversation?.messages.length ?? 0;
  const lastText = conversation?.messages[messageCount - 1]?.text;
  const statusLabel = conversation?.status;
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [messageCount, lastText, statusLabel]);

  const configured = agent ? Boolean(agent.config.agentId) : null;
  const modelLabel = agent?.config.model ?? null;

  function send(text: string) {
    if (!conversationId) return;
    void sendMessage(conversationId, text, true).catch(() => {});
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.agent}>
          <Terminal size={16} aria-hidden />
          <strong>CLI 对话</strong>
          {agent && configured ? (
            <span className={styles.agentMeta}>
              {agent.name}
              {modelLabel ? ` · ${modelLabel}` : ""}
            </span>
          ) : agent ? (
            <span className={styles.agentMeta}>未配置对话 CLI</span>
          ) : (
            <span className={styles.agentMeta}>{agentError || "正在读取配置…"}</span>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void navigate({ to: "/chat" })}
          disabled={streaming}
        >
          <MessageSquarePlus size={14} />
          新对话
        </Button>
      </header>

      {configured === false && (
        <div className={styles.empty} role="status">
          <Settings2 size={20} aria-hidden />
          <p>
            还没有选择用于对话的 CLI。请先到设置页选择本机的 agent CLI（如
            claude、codex），再回来开始多轮对话。
          </p>
          <Link to="/settings" className={styles.settingsLink}>
            前往设置
          </Link>
        </div>
      )}

      {configured !== false && conversation && messageCount === 0 && !streaming && (
        <p className={styles.hint}>
          用选定的 CLI 开始多轮对话。对话内容只保留在本次会话中，刷新页面后清空。
        </p>
      )}

      {conversation && <ChatMessages conversation={conversation} />}

      {conversation?.status && streaming && (
        <p className={styles.status} role="status">
          {conversation.status}
        </p>
      )}

      {conversation?.error && (
        <div className={styles.error} role="alert">
          <span>{conversation.error}</span>
          {conversation.errorKind === "not_configured" ? (
            <Link to="/settings">前往设置</Link>
          ) : (
            <span className={styles.errorHint}>修改内容后可重新发送</span>
          )}
        </div>
      )}

      <div ref={listEnd} aria-hidden />

      {configured !== false && (
        <div className={styles.composerDock}>
          <ChatComposer
            streaming={streaming}
            disabled={configured !== true}
            onSend={send}
            onStop={() => cancel(conversationId)}
          />
        </div>
      )}
    </div>
  );
}
