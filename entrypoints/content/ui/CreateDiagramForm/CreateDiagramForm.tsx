import { useState } from "react";
import { Button, Stack, TextField } from "@/shared/ui";
import { useActiveDiagramStore } from "../../model/stores/activeDiagramStore";

type CreateDiagramFormProps = {
  isDisabled: boolean;
  onLoadingChange: (isLoading: boolean) => void;
};

export const CreateDiagramForm = ({ isDisabled, onLoadingChange }: CreateDiagramFormProps) => {
  const onCreate = useActiveDiagramStore((s) => s.onCreate);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsLoading(true);
    onLoadingChange(true);
    try {
      await onCreate(name); // resolves into a tab reload on success
    } finally {
      setIsLoading(false);
      onLoadingChange(false);
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
        disabled={isLoading}
        autoFocus
      />
      <Button type="submit" isLoading={isLoading} disabled={isDisabled}>
        Create
      </Button>
      <Button variant="secondary" disabled={isLoading} onClick={() => setIsCreating(false)}>
        Cancel
      </Button>
    </Stack>
  );
};
