import clsx from "clsx";
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
      className={clsx(styles.listItem, active && styles.active)}
    >
      {children}
    </Box>
  );
};
