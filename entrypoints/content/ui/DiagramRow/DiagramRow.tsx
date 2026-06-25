import { useState } from "react";
import { stripExcalidrawExtension } from "@/entities/diagram";
import type { DriveFileMeta } from "@/shared/api";
import { formatDate } from "@/shared/lib";
import { Button, ListItem, Spinner, Stack, Text, TextField } from "@/shared/ui";
import styles from "./DiagramRow.module.css";

type Props = {
  file: DriveFileMeta;
  isActive: boolean;
  isLocked: boolean;
  isOpening: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
};

export const DiagramRow = ({ file, isActive, isLocked, isOpening, onOpen, onRename }: Props) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name) {
      setIsRenaming(false);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(file.id, name); // optimistic in-place update in the container
    } finally {
      setIsSaving(false);
      setIsRenaming(false);
    }
  };

  if (isRenaming) {
    return (
      <Stack as="li" direction="row" gap="1" align="center" className={styles.listRow}>
        <Stack
          as="form"
          direction="row"
          gap="1"
          align="center"
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <TextField
            name="diagramName"
            aria-label="Rename diagram"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
          {isSaving ? <Spinner size={14} /> : <Button type="submit">Save</Button>}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack as="li" direction="row" gap="1" align="center" className={styles.listRow}>
      <ListItem isActive={isActive} disabled={isActive || isLocked} onClick={() => onOpen(file.id)}>
        <span className={styles.name}>{stripExcalidrawExtension(file.name)}</span>
        {isOpening ? (
          <Spinner size={14} />
        ) : (
          <Text size="xs" color="muted" className={styles.meta}>
            {formatDate(file.modifiedTime)}
          </Text>
        )}
      </ListItem>
      <Button
        variant="ghost"
        aria-label={`Rename ${stripExcalidrawExtension(file.name)}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsRenaming(true);
          setRenameValue(stripExcalidrawExtension(file.name));
        }}
      >
        Rename
      </Button>
    </Stack>
  );
};
