import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import styles from "./ChatComposer.module.css";

interface ChatComposerProps {
  streaming: boolean;
  disabled?: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
}

export function ChatComposer({ streaming, disabled, onSend, onStop }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!streaming && !disabled) textarea.current?.focus();
  }, [streaming, disabled]);

  function submit() {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    setValue("");
    onSend(text);
  }

  return (
    <div className={styles.composer}>
      <textarea
        ref={textarea}
        value={value}
        rows={3}
        maxLength={8000}
        disabled={streaming || disabled}
        placeholder={streaming ? "正在生成回复…" : "继续提问，Enter 发送，Shift+Enter 换行"}
        aria-label="对话输入"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className={styles.actions}>
        <span className={styles.hint}>Enter 发送 · Shift+Enter 换行</span>
        {streaming ? (
          <button type="button" className={styles.stop} onClick={onStop} aria-label="停止生成">
            <Square size={14} aria-hidden />
            停止生成
          </button>
        ) : (
          <button
            type="button"
            className={styles.send}
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="发送"
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
