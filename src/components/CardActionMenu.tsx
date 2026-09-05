import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/Button";
import styles from "./CardActionMenu.module.css";
export interface CardAction { key: string; label: string; icon: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; }
interface Props { actions: CardAction[]; label: string; className?: string; onOpenChange?: (open: boolean) => void; }
export function CardActionMenu({ actions, label, className = "", onOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const callback = useRef(onOpenChange);
  const closing = useRef(false);
  useEffect(() => { callback.current = onOpenChange; }, [onOpenChange]);
  const change = useCallback((value: boolean) => { setOpen(value); callback.current?.(value); }, []);
  const close = useCallback(async (restore = true) => {
    if (closing.current) return;
    closing.current = true;
    if (menu.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { await menu.current.animate([{opacity:1},{opacity:0}], {duration:140,easing:'cubic-bezier(.23,1,.32,1)'}).finished; } catch { /* Unmounted while closing. */ }
    }
    change(false); closing.current = false;
    if (restore) trigger.current?.querySelector('button')?.focus();
  }, [change]);
  useLayoutEffect(() => {
    if (!open || !menu.current || !container.current) return;
    const node = menu.current;
    const anchor = container.current.getBoundingClientRect();
    const dialog = container.current.closest('dialog')?.getBoundingClientRect();
    const bottom = Math.min(window.innerHeight - 12, dialog ? dialog.bottom - 24 : Infinity);
    const top = Math.max(12, dialog ? dialog.top + 24 : 0);
    const height = node.getBoundingClientRect().height;
    if (anchor.bottom + height + 4 > bottom && anchor.top - top > bottom - anchor.bottom) {
      node.style.top = 'auto'; node.style.bottom = 'calc(100% + 4px)';
      node.style.maxHeight = `${Math.max(60, anchor.top - top)}px`;
    } else node.style.maxHeight = `${Math.max(60, bottom - anchor.bottom - 4)}px`;
    const rect = node.getBoundingClientRect();
    if (rect.left < 12) node.style.right = `${rect.left - 12}px`;
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const node = menu.current;
    node?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    if (node && !matchMedia('(prefers-reduced-motion: reduce)').matches) node.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.23,1,.32,1)'});
    const outside = (e: PointerEvent) => { if (!(e.target instanceof Node) || !container.current?.contains(e.target)) void close(false); };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); node?.getAnimations().forEach(a => a.cancel()); };
  }, [open, close]);
  useEffect(() => () => callback.current?.(false), []);
  if (!actions.length) return null;
  return <div className={`${styles.container} ${className}`} ref={container} onClick={e => e.stopPropagation()}><div ref={trigger}><Button variant="ghost" iconOnly aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { if (open) void close(); else change(true); }} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); change(true); } }}><MoreHorizontal size={16}/></Button></div>
    {open && <div id={id} ref={menu} role="menu" aria-label={label} className={styles.menu} onKeyDown={e => {
      const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const active=document.activeElement;const index=active instanceof HTMLButtonElement?nodes.indexOf(active):-1;
      if (e.key==='Escape') { e.preventDefault(); e.stopPropagation(); void close(); }
      if (e.key==='Tab') { void close(false); }
      if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault(); const next=e.key==='Home'?0:e.key==='End'?nodes.length-1:(index+(e.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length; nodes[next]?.focus(); }
    }}>{actions.map(action => <button key={action.key} type="button" role="menuitem" disabled={action.disabled} className={action.danger ? styles.danger : undefined} onClick={() => { void close().then(() => action.onSelect()); }}><span aria-hidden>{action.icon}</span>{action.label}</button>)}</div>}
  </div>;
}
