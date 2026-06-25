import { useState } from "react";
import type { SaveStatus } from "@/features/autosave";
import type { DriveFileMeta } from "@/shared/api";
import { Badge, Button, Heading, Spinner, Stack, Text, type Tone } from "@/shared/ui";
import type { ActiveDiagram } from "../../model/useActiveDiagram";
import { usePanelVisibility } from "../../model/usePanelVisibility";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramPanel.module.css";

type Diagram = Pick<
  ActiveDiagram,
  "activeId" | "saveStatus" | "onOpen" | "onCreate" | "onRename"
> & {
  error?: string | null;
};

type DiagramPanelProps = {
  diagram: Diagram;
  files: DriveFileMeta[];
  isLoading: boolean;
  onSignOut: () => void;
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

export const DiagramPanel = ({ diagram, files, isLoading, onSignOut }: DiagramPanelProps) => {
  const { activeId, saveStatus, error, onOpen, onCreate, onRename } = diagram;
  const { isVisible, toggleVisibility } = usePanelVisibility();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isCreatingBusy, setIsCreatingBusy] = useState(false);

  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  // Opening or creating replaces the canvas (tab reload) — lock the rows so a
  // second action can't race it.
  const areRowsLocked = openingId !== null || isCreatingBusy;

  const onRowOpen = async (id: string) => {
    if (openingId) return; // a switch is already in flight
    setOpeningId(id);
    try {
      await onOpen(id); // resolves into a tab reload on success
    } finally {
      setOpeningId(null);
    }
  };

  const onCreatingBusyChange = (isBusy: boolean) => setIsCreatingBusy(isBusy);

  if (!isVisible) {
    return (
      <button
        type="button"
        className={styles.fab}
        aria-label="Open Excalistore diagrams"
        onClick={toggleVisibility}
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
    <Stack
      as="section"
      gap="2"
      padding="3"
      border="thin"
      radius="md"
      shadow="md"
      className={styles.root}
      aria-label="Excalistore diagrams"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <Stack as="header" direction="row" align="center" justify="between">
        <Heading size="md">Diagrams</Heading>
        <Stack direction="row" align="center" gap="2">
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <button
            type="button"
            className={styles.toggle}
            aria-label="Collapse panel"
            onClick={toggleVisibility}
          >
            −
          </button>
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
        <Stack as="ul" gap="1">
          {ordered.map((f) => (
            <DiagramRow
              key={f.id}
              file={f}
              active={f.id === activeId}
              locked={areRowsLocked}
              opening={openingId === f.id}
              onOpen={onRowOpen}
              onRename={onRename}
            />
          ))}
        </Stack>
      )}

      <Stack as="footer" gap="2" className={styles.footer}>
        <CreateDiagramForm
          disabled={areRowsLocked}
          onCreate={onCreate}
          onBusyChange={onCreatingBusyChange}
        />
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );
};
