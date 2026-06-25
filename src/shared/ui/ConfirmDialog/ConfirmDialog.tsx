import { Button } from "../Button";
import { Dialog } from "../Dialog";
import { Stack } from "../Stack";
import { Text } from "../Text";
import styles from "./ConfirmDialog.module.css";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) => {
  return (
    <Dialog title={title} onClose={onCancel}>
      <Text as="p" color="muted" className={styles.message}>
        {message}
      </Text>
      <Stack direction="row" gap="2" justify="end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Stack>
    </Dialog>
  );
};
