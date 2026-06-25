import { useState } from "react";
import { Button, Spinner, Stack, TextField } from "@/shared/ui";

type Props = {
  disabled: boolean;
  onCreate: (name: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
};

export const CreateDiagramForm = ({ disabled, onCreate, onBusyChange }: Props) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    onBusyChange(true);
    try {
      await onCreate(name); // resolves into a tab reload on success
    } finally {
      setBusy(false);
      onBusyChange(false);
      setNewName("");
      setCreating(false);
    }
  };

  if (!creating) {
    return (
      <Button disabled={disabled} onClick={() => setCreating(true)}>
        New diagram
      </Button>
    );
  }

  return (
    <Stack
      as="form"
      direction="row"
      gap="1"
      align="center"
      onSubmit={(e) => {
        e.preventDefault();
        submitCreate();
      }}
    >
      <TextField
        name="diagramName"
        placeholder="Diagram name"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        disabled={busy}
        autoFocus
      />
      {busy ? (
        <Spinner size={14} />
      ) : (
        <>
          <Button type="submit" disabled={disabled}>
            Create
          </Button>
          <Button variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </>
      )}
    </Stack>
  );
};
