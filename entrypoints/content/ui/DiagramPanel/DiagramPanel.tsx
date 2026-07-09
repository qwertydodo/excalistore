import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Heading, IconButton, Spinner, Stack, Text, type Tone } from "@/shared/ui";
import type { SaveStatus } from "../../lib/autosaveController";
import { useActiveDiagramStore } from "../../model/stores/activeDiagramStore";
import { useDiagramLibraryStore } from "../../model/stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "../../model/stores/panelVisibilityStore";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramList } from "../DiagramList";
import styles from "./DiagramPanel.module.css";

type DiagramPanelProps = {
  onSignOut: () => void;
};

const STATUS_TONE: Record<SaveStatus, Tone> = {
  idle: "neutral",
  saving: "neutral",
  saved: "success",
  error: "danger",
  conflict: "danger",
  deleted: "danger",
};

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Idle",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  conflict: "Conflict — not saved",
  deleted: "Diagram deleted on Drive",
};

export const DiagramPanel = ({ onSignOut }: DiagramPanelProps) => {
  const { saveStatus, error, onOpen } = useActiveDiagramStore(
    useShallow((s) => ({ saveStatus: s.saveStatus, error: s.actionError, onOpen: s.onOpen })),
  );
  const { isVisible, toggleVisibility } = usePanelVisibilityStore(
    useShallow((s) => ({ isVisible: s.isVisible, toggleVisibility: s.toggleVisibility })),
  );
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isCreateLoading, setIsCreateLoading] = useState(false);

  // isQueryLoaded is guaranteed true by the time this panel mounts (App
  // gates first paint on it — see useAppInit) so isFilesLoading alone is the
  // relevant ongoing-loading indicator here.
  const isLoading = useDiagramLibraryStore((s) => s.isFilesLoading);

  // Opening or creating replaces the canvas (tab reload) — lock the rows so a
  // second action can't race it.
  const areRowsLocked = openingId !== null || isCreateLoading;

  const onRowOpen = async (id: string) => {
    if (openingId) return; // a switch is already in flight
    setOpeningId(id);
    try {
      await onOpen(id); // resolves into a tab reload on success
    } finally {
      setOpeningId(null);
    }
  };

  const onCreateLoadingChange = (isLoading: boolean) => setIsCreateLoading(isLoading);

  if (!isVisible) {
    return (
      <IconButton
        icon="folderOpen"
        variant="neutral"
        size="md"
        shape="square"
        aria-label="Open Excalistore diagrams"
        onClick={toggleVisibility}
      />
    );
  }

  return (
    <Stack
      as="section"
      gap="2"
      padding="3"
      border="thin"
      radius="md"
      shadow="md"
      className={styles.root}
      aria-label="Excalistore diagrams"
    >
      <Stack as="header" direction="row" align="center" justify="between">
        <Heading>Diagrams</Heading>
        <Stack direction="row" align="center" gap="2">
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <IconButton icon="minus" aria-label="Collapse panel" onClick={toggleVisibility} />
        </Stack>
      </Stack>

      {error ? (
        <Text as="p" size="sm" color="accent-text" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}

      {isLoading ? (
        <Stack direction="row" justify="center" padding="4">
          <Spinner />
        </Stack>
      ) : (
        <DiagramList areRowsLocked={areRowsLocked} openingId={openingId} onRowOpen={onRowOpen} />
      )}

      <Stack as="footer" gap="2" className={styles.footer}>
        <CreateDiagramForm isDisabled={areRowsLocked} onLoadingChange={onCreateLoadingChange} />
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );
};
