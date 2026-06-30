import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Box } from "../Box";
import { Icon, type IconName } from "../Icon";
import styles from "./Button.module.css";

export type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
};

export const Button = ({ variant = "primary", icon, className, children, ...rest }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      border="thin"
      radius="md"
      className={clsx(styles.button, styles[variant], icon && styles.withIcon, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} aria-hidden /> : null}
      {children}
    </Box>
  );
};
