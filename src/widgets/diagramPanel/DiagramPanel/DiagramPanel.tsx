import { useState } from "react";
import type { SaveStatus } from "@/features/autosave";
import type { DriveFileMeta } from "@/shared/api";
import { Badge, Button, Spinner, type Tone } from "@/shared/ui";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramPanel.module.css";

type Diagram = {
  files: DriveFileMeta[];
  activeId: string | null;
  saveStatus: SaveStatus;
  loading: boolean;
  collapsed: boolean;
  error?: string | null;
  onOpen: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onSignOut: () => void;
  onToggleCollapse: () => void;
};

type DiagramPanelProps = {
  diagram: Diagram;
};

const STATUS_TONE: Record<SaveStatus, Tone> = {
  idle: "neutral",
  saving: "neutral",
  saved: "success",
  error: "danger",
  conflict: "danger",
};

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Idle",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  conflict: "Conflict — not saved",
};

export const DiagramPanel = ({ diagram }: DiagramPanelProps) => {
  const {
    files,
    activeId,
    saveStatus,
    loading,
    collapsed,
    error,
    onOpen,
    onCreate,
    onRename,
    onSignOut,
    onToggleCollapse,
  } = diagram;
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  // Opening or creating replaces the canvas (tab reload) — lock the rows so a
  // second action can't race it.
  const rowsLocked = openingId !== null || creatingBusy;

  const onRowOpen = async (id: string) => {
    if (openingId) return; // a switch is already in flight
    setOpeningId(id);
    try {
      await onOpen(id); // resolves into a tab reload on success
    } finally {
      setOpeningId(null);
    }
  };

  const onCreatingBusyChange = (busy: boolean) => setCreatingBusy(busy);

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.fab}
        aria-label="Open Excalistore diagrams"
        onClick={onToggleCollapse}
        onKeyDown={(e) => e.stopPropagation()}
      >
        +
      </button>
    );
  }

  return (
    // Excalidraw binds single-key tool shortcuts on the document, which would
    // fire while typing in the panel's inputs. Stop keyboard events at the panel
    // root so they never reach Excalidraw's global handlers.
    <section
      className={styles.root}
      aria-label="Excalistore diagrams"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Diagrams</h2>
        <div className={styles.headerRight}>
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <button
            type="button"
            className={styles.toggle}
            aria-label="Collapse panel"
            onClick={onToggleCollapse}
          >
            −
          </button>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : (
        <ul className={styles.list}>
          {ordered.map((f) => (
            <DiagramRow
              key={f.id}
              file={f}
              active={f.id === activeId}
              locked={rowsLocked}
              opening={openingId === f.id}
              onOpen={onRowOpen}
              onRename={onRename}
            />
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        <CreateDiagramForm
          disabled={rowsLocked}
          onCreate={onCreate}
          onBusyChange={onCreatingBusyChange}
        />
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </footer>
    </section>
  );
};
