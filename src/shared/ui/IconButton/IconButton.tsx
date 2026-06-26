import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import type { IconName } from "../Icon";
import { Icon } from "../Icon";
import styles from "./IconButton.module.css";

type Variant = "ghost" | "primary" | "neutral";
type Size = "sm" | "md";
type Shape = "square" | "circle";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  variant?: Variant;
  size?: Size;
  shape?: Shape;
};

export const IconButton = ({
  icon,
  variant = "ghost",
  size = "sm",
  shape = "square",
  className,
  ...rest
}: IconButtonProps) => {
  return (
    <button
      type="button"
      className={clsx(styles.iconButton, styles[variant], styles[size], styles[shape], className)}
      {...rest}
    >
      <Icon name={icon} size={size} aria-hidden />
    </button>
  );
};
