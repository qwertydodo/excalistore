import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import styles from "./IconButton.module.css";

type Variant = "ghost" | "primary";
type Size = "sm" | "md";
type Shape = "square" | "circle";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
};

export const IconButton = ({
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
    />
  );
};
