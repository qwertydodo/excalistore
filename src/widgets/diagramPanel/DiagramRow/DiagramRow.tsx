import { useState } from "react";
import { stripExcalidrawExtension } from "@/entities/diagram";
import type { DriveFileMeta } from "@/shared/api";
import { formatDate } from "@/shared/lib";
import { Button, ListItem, Spinner, TextField } from "@/shared/ui";
import styles from "./DiagramRow.module.css";

type Props = {
  file: DriveFileMeta;
  active: boolean;
  locked: boolean;
  opening: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
};

export const DiagramRow = ({ file, active, locked, opening, onOpen, onRename }: Props) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name) {
      setIsRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(file.id, name); // optimistic in-place update in the container
    } finally {
      setSaving(false);
      setIsRenaming(false);
    }
  };

  if (isRenaming) {
    return (
      <li className={styles.listRow}>
        <form
          className={styles.renameRow}
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <TextField
            aria-label="Rename diagram"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={saving}
            autoFocus
          />
          {saving ? <Spinner size={14} /> : <Button type="submit">Save</Button>}
        </form>
      </li>
    );
  }

  return (
    <li className={styles.listRow}>
      <ListItem active={active} disabled={active || locked} onClick={() => onOpen(file.id)}>
        <span className={styles.name}>{stripExcalidrawExtension(file.name)}</span>
        {opening ? (
          <Spinner size={14} />
        ) : (
          <span className={styles.meta}>{formatDate(file.modifiedTime)}</span>
        )}
      </ListItem>
      <button
        type="button"
        className={styles.renameBtn}
        aria-label={`Rename ${stripExcalidrawExtension(file.name)}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsRenaming(true);
          setRenameValue(stripExcalidrawExtension(file.name));
        }}
      >
        Rename
      </button>
    </li>
  );
};
