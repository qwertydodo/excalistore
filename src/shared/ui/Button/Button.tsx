import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = ({ variant = "primary", className, ...rest }: Props) => {
  return (
    <button
      type="button"
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
};
