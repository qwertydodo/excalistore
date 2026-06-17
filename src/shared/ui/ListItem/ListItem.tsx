import type { ReactNode } from "react";
import styles from "./ListItem.module.css";

interface Props {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function ListItem({ active = false, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[styles.listItem, active ? styles.active : null].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
