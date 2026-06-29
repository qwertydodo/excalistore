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
  title,
  "aria-label": ariaLabel,
  ...rest
}: IconButtonProps) => {
  return (
    <button
      type="button"
      className={clsx(styles.iconButton, styles[variant], styles[size], styles[shape], className)}
      aria-label={ariaLabel}
      // Icon buttons have no visible label, so the hover tooltip mirrors the
      // accessible label by default — pass an explicit `title` only to override.
      title={title ?? ariaLabel}
      {...rest}
    >
      <Icon name={icon} size={size} aria-hidden />
    </button>
  );
};
