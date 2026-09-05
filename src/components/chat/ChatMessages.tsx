import { Wrench } from "lucide-react";
import { Disclosure } from "../ui/Disclosure";
import { SkillMarkdown } from "../SkillMarkdown";
import type { ChatConversation, ChatMessage, ChatToolCall } from "../../stores/useChatStore";
import styles from "./ChatMessages.module.css";

function formatInput(input: ChatToolCall["input"]): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  // JsonValue 一定是可序列化的 JSON，stringify 不会失败。
  return JSON.stringify(input, null, 2) ?? "";
}

function ToolCallCard({ tool }: { tool: ChatToolCall }) {
  const input = formatInput(tool.input);
  return (
    <div className={styles.tool} data-error={tool.isError ? "" : undefined}>
      <Disclosure
        title={
          <span className={styles.toolTitle}>
            <Wrench size={13} aria-hidden />
            <span className={styles.toolName}>{tool.name}</span>
            {tool.isError && <span className={styles.toolError}>出错</span>}
            {tool.result === undefined && <span className={styles.toolPending}>执行中…</span>}
          </span>
        }
      >
        {input && (
          <>
            <h4 className={styles.toolHeading}>输入</h4>
            <pre className={styles.toolBody}>{input}</pre>
          </>
        )}
        {tool.result !== undefined && (
          <>
            <h4 className={styles.toolHeading}>输出</h4>
            <pre className={styles.toolBody}>{tool.result || "（无输出）"}</pre>
          </>
        )}
      </Disclosure>
    </div>
  );
}

function AssistantMessage({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const thinking = message.thinking ?? "";
  return (
    <div className={styles.assistant}>
      {thinking && (
        <Disclosure
          title={streaming && !message.text ? "思考中…" : `思考过程 · ${thinking.length} 字`}
        >
          <p className={styles.thinking}>{thinking}</p>
        </Disclosure>
      )}
      {message.tools.map((tool) => (
        <ToolCallCard key={tool.id} tool={tool} />
      ))}
      {message.text ? (
        <SkillMarkdown content={message.text} className={styles.markdown} />
      ) : (
        streaming &&
        !thinking &&
        !message.tools.length && <p className={styles.placeholder}>正在生成回复…</p>
      )}
    </div>
  );
}

export function ChatMessages({ conversation }: { conversation: ChatConversation }) {
  return (
    <div className={styles.list} aria-live="polite" aria-label="对话内容">
      {conversation.messages.map((message, index) =>
        message.role === "user" ? (
          <div className={styles.userRow} key={message.id}>
            <div className={styles.userBubble}>{message.text}</div>
          </div>
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            streaming={conversation.streaming && index === conversation.messages.length - 1}
          />
        ),
      )}
    </div>
  );
}
