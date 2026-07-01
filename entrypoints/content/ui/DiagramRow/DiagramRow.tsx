import { useState } from "react";
import { stripExcalidrawExtension } from "@/entities/diagram";
import type { DriveFileMeta } from "@/shared/api";
import { formatDate } from "@/shared/lib";
import {
  Button,
  ConfirmDialog,
  IconButton,
  ListItem,
  Spinner,
  Stack,
  Text,
  TextField,
} from "@/shared/ui";
import styles from "./DiagramRow.module.css";

type Props = {
  file: DriveFileMeta;
  isActive: boolean;
  isLocked: boolean;
  isOpening: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export const DiagramRow = ({
  file,
  isActive,
  isLocked,
  isOpening,
  onOpen,
  onRename,
  onDelete,
}: Props) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const name = stripExcalidrawExtension(file.name);

  const submitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setIsRenaming(false);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(file.id, trimmed);
    } finally {
      setIsSaving(false);
      setIsRenaming(false);
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(file.id);
    } finally {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
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
          className={styles.content}
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <TextField
            name="diagramName"
            aria-label="Rename diagram"
            size="sm"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
          <Stack className={styles.actions}>
            <Button type="submit" size="sm" width="full" isLoading={isSaving}>
              Save
            </Button>
          </Stack>
        </Stack>
      </Stack>
    );
  }

  return (
    <>
      <Stack as="li" direction="row" gap="1" align="center" className={styles.listRow}>
        <ListItem
          isActive={isActive}
          disabled={isActive || isLocked}
          onClick={() => onOpen(file.id)}
          className={styles.content}
        >
          <span className={styles.name}>{name}</span>
          {isOpening ? (
            <Spinner size="sm" />
          ) : (
            <Text size="xs" color="muted" className={styles.meta}>
              {formatDate(file.modifiedTime)}
            </Text>
          )}
        </ListItem>
        <Stack direction="row" gap="1" align="center" className={styles.actions}>
          <IconButton
            icon="edit"
            aria-label={`Rename ${name}`}
            disabled={isLocked || isDeleting}
            onClick={() => {
              setIsRenaming(true);
              setRenameValue(name);
            }}
          />
          <IconButton
            icon="trash"
            aria-label={`Delete ${name}`}
            disabled={isLocked || isDeleting}
            onClick={() => setIsConfirmingDelete(true)}
          />
        </Stack>
      </Stack>
      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete diagram?"
          message={
            isActive
              ? `Move '${name}' to Drive Trash? The canvas will be cleared.`
              : `Move '${name}' to Drive Trash?`
          }
          confirmLabel="Move to Trash"
          isDanger
          onConfirm={confirmDelete}
          onCancel={() => setIsConfirmingDelete(false)}
        />
      )}
    </>
  );
};
