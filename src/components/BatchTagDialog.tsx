import { getErrorMessage } from "../lib/error";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useMemo, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

interface TaggableSkill {
  tags: string[];
}

interface Props {
  open: boolean;
  skills: TaggableSkill[];
  allTags: string[];
  onClose: () => void;
  onApply: (adds: string[], removes: string[]) => Promise<void>;
}

export function BatchTagDialog({ open, skills, allTags, onClose, onApply }: Props) {
  const { t } = useTranslation();
  const [adds, setAdds] = useState<string[]>([]);
  const [removes, setRemoves] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setAdds([]);
      setRemoves([]);
      setInput("");
    }
  }

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      for (const tag of skill.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).toSorted((a, b) => b[1] - a[1]);
  }, [skills]);

  const suggestions = useMemo(() => {
    const needle = input.trim().toLowerCase();
    const existing = new Set(tagCounts.map(([t]) => t));
    return allTags
      .filter((tag) => {
        if (adds.includes(tag)) return false;
        if (existing.has(tag)) return false;
        if (!needle) return true;
        return tag.toLowerCase().includes(needle);
      })
      .slice(0, 8);
  }, [allTags, adds, input, tagCounts]);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!adds.includes(trimmed)) setAdds([...adds, trimmed]);
    setInput("");
    inputRef.current?.focus();
  };

  const toggleRemove = (tag: string) => {
    setRemoves((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleApply = async () => {
    if (pending.current) return;
    if (adds.length === 0 && removes.length === 0) {
      onClose();
      return;
    }
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await onApply(adds, removes);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, t("common.error")));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const hasChanges = adds.length > 0 || removes.length > 0;

  return (
    <DetailSheet
      open={open}
      title={t("mySkills.batchTagDialog.title", { count: skills.length })}
      onClose={() => {
        if (!pending.current) {
          setError("");
          onClose();
        }
      }}
      size="compact"
      closeDisabled={loading}
    >
      {error && (
        <p role="alert" className="text-danger mb-3">
          {error}
        </p>
      )}
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-tertiary mb-1.5">
              {t("mySkills.batchTagDialog.currentTags")}
            </label>
            {tagCounts.length === 0 ? (
              <p className="text-[12px] text-faint">{t("mySkills.batchTagDialog.noTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tagCounts.map(([tag, count]) => {
                  const marked = removes.includes(tag);
                  return (
                    <button
                      key={tag}
                      aria-pressed={marked}
                      onClick={() => toggleRemove(tag)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors",
                        marked
                          ? "bg-[var(--ds-danger-bg)] text-[var(--ds-danger)] line-through"
                          : "bg-accent-bg text-accent-light hover:bg-[var(--ds-danger-bg)] hover:text-[var(--ds-danger)]",
                      )}
                      title={
                        marked
                          ? t("mySkills.batchTagDialog.undoRemove")
                          : t("mySkills.batchTagDialog.clickToRemove")
                      }
                    >
                      {tag}
                      <span className="text-[10px] opacity-70">
                        {count}/{skills.length}
                      </span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[12px] font-medium text-tertiary mb-1.5">
              {t("mySkills.batchTagDialog.toAdd")}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {adds.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--ds-success-bg)] px-2 py-0.5 text-[12px] font-medium text-[color-mix(in_srgb,var(--ds-success)_55%,var(--ds-strong))]"
                >
                  {tag}
                  <button
                    aria-label={`${t("common.delete")} ${tag}`}
                    onClick={() => setAdds(adds.filter((a) => a !== tag))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  aria-label={t("mySkills.tags.addTag")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addTag(input);
                    } else if (e.key === "Escape") {
                      setInput("");
                    }
                  }}
                  placeholder={t("mySkills.tags.addTag")}
                  className="app-input w-40 px-2 text-[12px]"
                />
                {suggestions.length > 0 && input && (
                  <div
                    className="mt-2 flex max-w-[280px] flex-wrap gap-1 rounded-md border border-border-subtle bg-surface p-1"
                    role="group"
                    aria-label="建议标签"
                  >
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addTag(suggestion)}
                        className="w-full truncate rounded-sm px-1.5 py-1 text-left text-[12px] text-secondary hover:bg-surface-hover"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => addTag(input)}
                disabled={!input.trim()}
                className="inline-flex items-center h-7 w-7 justify-center rounded-lg border border-border-subtle text-muted transition-colors hover:border-accent hover:text-accent-light disabled:opacity-50"
                aria-label={t("mySkills.batchTagDialog.addButton")}
                title={t("mySkills.batchTagDialog.addButton")}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-5">
          <Button
            onClick={() => {
              if (!pending.current) {
                setError("");
                onClose();
              }
            }}
            variant="ghost"
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleApply}
            disabled={loading || !hasChanges}
            variant="primary"
            busy={loading}
          >
            {loading ? t("common.loading") : t("mySkills.batchTagDialog.apply")}
          </Button>
        </div>
      </fieldset>
    </DetailSheet>
  );
}
