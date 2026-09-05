import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../hooks/useApp";
import * as api from "../lib/tauri";
import type { Preset } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { getPresetIconOption } from "../lib/presetIcons";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { CardActionMenu } from "./CardActionMenu";
import { CreatePresetDialog } from "./CreatePresetDialog";
import { RenamePresetDialog } from "./RenamePresetDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./PresetManager.module.css";

export function PresetManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { presets, viewedPreset, setViewedPresetId, refreshPresets, refreshManagedSkills } = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  async function mutate(action: () => Promise<unknown>) {
    if (pending.current) throw new Error("正在保存，请稍候再试。");
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (pending.current || target < 0 || target >= presets.length) return;
    const next = [...presets];
    [next[index], next[target]] = [next[target], next[index]];
    try { await mutate(() => api.reorderPresets(next.map(preset => preset.id))); }
    catch (failure) { setError(getErrorMessage(failure, "无法调整顺序，请重试。")); }
  }
  function view(preset: Preset) {
    setViewedPresetId(preset.id);
    onClose();
    void navigate({ to: "/my-skills" });
  }
  return <>
    <DetailSheet open={open} title="技能预设" description="把常用技能组织为预设，在项目或工具目录中一起启用。" onClose={onClose} closeDisabled={busy}>
      <div className={styles.toolbar}><span>{presets.length} 个预设</span><Button variant="primary" disabled={busy} onClick={() => setCreating(true)}><Plus size={15} />新建预设</Button></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {busy && <p role="status" className={styles.status}>正在保存预设…</p>}
      {!presets.length && <p className={styles.empty}>还没有预设。创建后，可在维护与更新中为它添加技能。</p>}
      <ul className={styles.list}>{presets.map((preset, index) => {
        const Icon = getPresetIconOption(preset).icon;
        return <li key={preset.id} className={styles.row}>
          <Icon size={19} aria-hidden />
          <div className={styles.content}><strong>{preset.name}</strong>{preset.description && <p>{preset.description}</p>}<span>{preset.skill_count} 个技能{viewedPreset?.id === preset.id ? " · 当前查看" : ""}</span></div>
          <Button disabled={busy} onClick={() => view(preset)}>查看技能</Button>
          <CardActionMenu label={`${preset.name} 的操作`} actions={[
            { key: "rename", label: "修改名称与图标", icon: <Pencil size={15} />, disabled: busy, onSelect: () => setRenaming(preset) },
            { key: "up", label: "上移", icon: <ArrowUp size={15} />, disabled: busy || index === 0, onSelect: () => { void move(index, -1); } },
            { key: "down", label: "下移", icon: <ArrowDown size={15} />, disabled: busy || index === presets.length - 1, onSelect: () => { void move(index, 1); } },
            { key: "delete", label: "删除预设", icon: <Trash2 size={15} />, disabled: busy, danger: true, onSelect: () => setDeleting(preset) },
          ]} />
        </li>;
      })}</ul>
    </DetailSheet>
    <CreatePresetDialog open={open && creating} onClose={() => setCreating(false)} onCreate={async (name, description, icon) => { await mutate(() => api.createPreset(name, description, icon)); toast.success("预设已创建"); }} />
    <RenamePresetDialog open={open && !!renaming} currentName={renaming?.name ?? ""} currentIcon={renaming?.icon} onClose={() => setRenaming(null)} onRename={async (name, icon) => {
      if (!renaming) return;
      await mutate(() => api.updatePreset(renaming.id, name, renaming.description || undefined, icon));
      toast.success("预设已更新");
    }} />
    <ConfirmDialog open={open && !!deleting} title="删除预设" message={`删除“${deleting?.name ?? ""}”的分组。全局技能文件会保留。`} onClose={() => setDeleting(null)} onConfirm={async () => {
      if (!deleting) return;
      await mutate(() => api.deletePreset(deleting.id));
      toast.success("预设已删除");
    }} />
  </>;
}
