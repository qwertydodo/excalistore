import type { ReactNode } from "react";
import styles from "./Dialog.module.css";

interface Props {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}

export function Dialog({ title, children, onClose }: Props) {
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
      <div className={styles.panel}>
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
