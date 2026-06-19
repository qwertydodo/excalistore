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
  error?: string | null;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSignOut: () => void;
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

export function DiagramPanel({
  files,
  activeId,
  saveStatus,
  loading,
  error,
  onOpen,
  onCreate,
  onRename,
  onSignOut,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  }

  function submitRename(id: string) {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  }

  return (
    <section className={styles.root} aria-label="Excalistore diagrams">
      <header className={styles.header}>
        <h2 className={styles.title}>Diagrams</h2>
        <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
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
          {files.map((f) => (
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
                    autoFocus
                  />
                  <Button type="submit">Save</Button>
                </form>
              ) : (
                <>
                  <ListItem active={f.id === activeId} onClick={() => onOpen(f.id)}>
                    <span className={styles.name}>{f.name}</span>
                    <span className={styles.meta}>{formatDate(f.modifiedTime)}</span>
                  </ListItem>
                  <button
                    type="button"
                    className={styles.renameBtn}
                    aria-label={`Rename ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(f.id);
                      setRenameValue(f.name);
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
              autoFocus
            />
            <Button type="submit">Create</Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
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
