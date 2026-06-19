import { useState } from "react";
import type { SaveStatus } from "@/features/autosave";
import type { DriveFileMeta } from "@/shared/api";
import { Badge, Button, ListItem, Spinner, TextField } from "@/shared/ui";
import styles from "./DiagramPanel.module.css";

interface Props {
  files: DriveFileMeta[];
  activeId: string | null;
  saveStatus: SaveStatus;
  loading: boolean;
  collapsed: boolean;
  error?: string | null;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSignOut: () => void;
  onToggleCollapse: () => void;
}

const STATUS_TONE: Record<SaveStatus, "neutral" | "success" | "danger"> = {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

// The .excalidraw extension is implied — hide it in the UI and re-add on save.
function stripExt(name: string): string {
  return name.replace(/\.excalidraw$/i, "");
}

export function DiagramPanel({
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
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  // Opening or creating replaces the canvas (tab reload) — lock the rows so a
  // second action can't race it.
  const rowsLocked = openingId !== null || creatingBusy;

  async function handleOpen(id: string) {
    if (openingId) return; // a switch is already in flight
    setOpeningId(id);
    try {
      await onOpen(id); // resolves into a tab reload on success
    } finally {
      setOpeningId(null);
    }
  }

  async function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreatingBusy(true);
    try {
      await onCreate(name); // resolves into a tab reload on success
    } finally {
      setCreatingBusy(false);
      setNewName("");
      setCreating(false);
    }
  }

  async function submitRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    setSavingRenameId(id);
    try {
      await onRename(id, name); // optimistic in-place update in the container
    } finally {
      setSavingRenameId(null);
      setRenamingId(null);
    }
  }

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
            <li key={f.id} className={styles.listRow}>
              {renamingId === f.id ? (
                <form
                  className={styles.renameRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename(f.id);
                  }}
                >
                  <TextField
                    aria-label="Rename diagram"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    disabled={savingRenameId === f.id}
                    autoFocus
                  />
                  {savingRenameId === f.id ? (
                    <Spinner size={14} />
                  ) : (
                    <Button type="submit">Save</Button>
                  )}
                </form>
              ) : (
                <>
                  <ListItem
                    active={f.id === activeId}
                    disabled={f.id === activeId || rowsLocked}
                    onClick={() => handleOpen(f.id)}
                  >
                    <span className={styles.name}>{stripExt(f.name)}</span>
                    {openingId === f.id ? (
                      <Spinner size={14} />
                    ) : (
                      <span className={styles.meta}>{formatDate(f.modifiedTime)}</span>
                    )}
                  </ListItem>
                  <button
                    type="button"
                    className={styles.renameBtn}
                    aria-label={`Rename ${stripExt(f.name)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(f.id);
                      setRenameValue(stripExt(f.name));
                    }}
                  >
                    Rename
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        {creating ? (
          <form
            className={styles.createRow}
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <TextField
              placeholder="Diagram name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creatingBusy}
              autoFocus
            />
            {creatingBusy ? (
              <Spinner size={14} />
            ) : (
              <>
                <Button type="submit">Create</Button>
                <Button variant="secondary" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </>
            )}
          </form>
        ) : (
          <Button onClick={() => setCreating(true)}>New diagram</Button>
        )}
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </footer>
    </section>
  );
}
