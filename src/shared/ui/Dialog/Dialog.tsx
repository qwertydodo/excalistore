import type { ReactNode } from "react";
import { Box } from "../Box";
import { Heading } from "../Heading";
import styles from "./Dialog.module.css";

type Props = {
  title: string;
  children: ReactNode;
  onClose?: () => void;
};

export const Dialog = ({ title, children, onClose }: Props) => {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a mouse convenience; content is keyboard-dismissible via dialog buttons.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <Box padding="5" border="thin" radius="md" shadow="md" className={styles.panel}>
        <Heading className={styles.title}>{title}</Heading>
        {children}
      </Box>
    </div>
  );
};
