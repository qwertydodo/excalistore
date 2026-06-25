import type { ReactNode } from "react";
import { Box } from "../Box";
import styles from "./ListItem.module.css";

type Props = {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export const ListItem = ({ active = false, disabled = false, onClick, children }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      radius="md"
      onClick={onClick}
      disabled={disabled}
      className={[styles.listItem, active ? styles.active : null].filter(Boolean).join(" ")}
    >
      {children}
    </Box>
  );
};
