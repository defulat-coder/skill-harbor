import { Trash2, CheckCircle2, Circle, RotateCcw, Tag, Download, Upload } from "lucide-react";
import { Button } from "./ui/Button";

interface MultiSelectToolbarLabels {
  hint: string;
  selected: string;
  update?: string;
  updateProject?: string;
  updateCenter?: string;
  delete: string;
  enable: string;
  disable: string;
  selectAll: string;
  deselectAll: string;
  cancel: string;
  editTags?: string;
}

interface MultiSelectToolbarProps {
  selectedCount: number;
  isAllSelected: boolean;
  anyDisabled: boolean;
  anyUpdatable?: boolean;
  anyCanUpdateProject?: boolean;
  anyCanUpdateCenter?: boolean;
  showToggle: boolean;
  updating?: boolean;
  updatingProject?: boolean;
  updatingCenter?: boolean;
  labels: MultiSelectToolbarLabels;
  onUpdate?: () => void;
  onUpdateProject?: () => void;
  onUpdateCenter?: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
  onEditTags?: () => void;
}

export function MultiSelectToolbar({
  selectedCount,
  isAllSelected,
  anyDisabled,
  anyUpdatable = false,
  anyCanUpdateProject = false,
  anyCanUpdateCenter = false,
  showToggle,
  updating = false,
  updatingProject = false,
  updatingCenter = false,
  labels,
  onUpdate,
  onUpdateProject,
  onUpdateCenter,
  onDelete,
  onToggle,
  onSelectAll,
  onCancel,
  onEditTags,
}: MultiSelectToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <span className="text-[13px] text-muted">
        {selectedCount > 0 ? labels.selected : labels.hint}
      </span>
      {selectedCount > 0 && (
        <>
          {anyUpdatable && labels.update && onUpdate && (
            <Button variant="primary" busy={updating} onClick={onUpdate}>
              {!updating && <RotateCcw size={14} aria-hidden />}
              {labels.update}
            </Button>
          )}
          {anyCanUpdateProject && labels.updateProject && onUpdateProject && (
            <Button variant="secondary" busy={updatingProject} onClick={onUpdateProject}>
              {!updatingProject && <Download size={14} aria-hidden />}
              {labels.updateProject}
            </Button>
          )}
          {anyCanUpdateCenter && labels.updateCenter && onUpdateCenter && (
            <Button variant="secondary" busy={updatingCenter} onClick={onUpdateCenter}>
              {!updatingCenter && <Upload size={14} aria-hidden />}
              {labels.updateCenter}
            </Button>
          )}
          {onEditTags && labels.editTags && (
            <Button variant="secondary" onClick={onEditTags}>
              <Tag size={14} aria-hidden />
              {labels.editTags}
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={14} aria-hidden />
            {labels.delete}
          </Button>
          {showToggle && (
            <Button variant="secondary" onClick={onToggle}>
              {anyDisabled
                ? <CheckCircle2 size={14} aria-hidden />
                : <Circle size={14} aria-hidden />}
              {anyDisabled ? labels.enable : labels.disable}
            </Button>
          )}
        </>
      )}
      <Button variant="secondary" onClick={onSelectAll}>
        {isAllSelected ? labels.deselectAll : labels.selectAll}
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        {labels.cancel}
      </Button>
    </div>
  );
}
