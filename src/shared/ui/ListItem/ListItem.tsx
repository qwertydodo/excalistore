import type { ReactNode } from "react";
import styles from "./ListItem.module.css";

interface Props {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function ListItem({ active = false, disabled = false, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[styles.listItem, active ? styles.active : null].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
