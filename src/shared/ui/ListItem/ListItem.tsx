import clsx from "clsx";
import type { ReactNode } from "react";
import { Box } from "../Box";
import styles from "./ListItem.module.css";

type Props = {
  isActive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export const ListItem = ({ isActive = false, disabled = false, onClick, children }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      radius="md"
      onClick={onClick}
      disabled={disabled}
      className={clsx(styles.listItem, isActive && styles.active)}
    >
      {children}
    </Box>
  );
};
