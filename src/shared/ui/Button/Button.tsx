import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Box } from "../Box";
import styles from "./Button.module.css";

export type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = ({ variant = "primary", className, ...rest }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      border="thin"
      radius="md"
      className={clsx(styles.button, styles[variant], className)}
      {...rest}
    />
  );
};
