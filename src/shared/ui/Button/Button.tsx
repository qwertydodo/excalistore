import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Box } from "../Box";
import { Icon, type IconName } from "../Icon";
import { Spinner } from "../Spinner";
import styles from "./Button.module.css";

export type Variant = "primary" | "secondary" | "danger";
export type Width = "content" | "full";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  isLoading?: boolean;
  width?: Width;
  size?: Size;
};

export const Button = ({
  variant = "primary",
  icon,
  isLoading = false,
  width = "content",
  size = "md",
  className,
  children,
  disabled,
  ...rest
}: Props) => {
  return (
    <Box
      as="button"
      type="button"
      border="thin"
      radius="md"
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        icon && styles.withIcon,
        isLoading && styles.loading,
        width !== "content" && styles[`width-${width}`],
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} aria-hidden /> : null}
      {/* Fade (not remove) the label while loading so the button keeps its
          layout size instead of shrinking to fit the spinner, and screen
          readers still get the label — aria-busy above conveys the loading
          state, so the decorative spinner is hidden from the a11y tree
          instead of also being announced. */}
      <span className={clsx(styles.label, isLoading && styles.content)}>{children}</span>
      {isLoading && (
        <span className={styles.spinnerOverlay} aria-hidden="true">
          <Spinner size="sm" />
        </span>
      )}
    </Box>
  );
};
