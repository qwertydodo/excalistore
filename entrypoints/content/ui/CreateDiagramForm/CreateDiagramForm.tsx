import { useState } from "react";
import { Button, Stack, TextField } from "@/shared/ui";

type Props = {
  isDisabled: boolean;
  onCreate: (name: string) => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
};

export const CreateDiagramForm = ({ isDisabled, onCreate, onBusyChange }: Props) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsBusy(true);
    onBusyChange(true);
    try {
      await onCreate(name); // resolves into a tab reload on success
    } finally {
      setIsBusy(false);
      onBusyChange(false);
      setNewName("");
      setIsCreating(false);
    }
  };

  if (!isCreating) {
    return (
      <Button disabled={isDisabled} onClick={() => setIsCreating(true)}>
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
        disabled={isBusy}
        autoFocus
      />
      <Button type="submit" isLoading={isBusy} disabled={isDisabled}>
        Create
      </Button>
      <Button variant="secondary" disabled={isBusy} onClick={() => setIsCreating(false)}>
        Cancel
      </Button>
    </Stack>
  );
};
