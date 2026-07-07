import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import { Box } from "../Box";
import { Icon, type IconName } from "../Icon";
import { IconButton } from "../IconButton";
import styles from "./TextField.module.css";

type Size = "sm" | "md";

export type IconSlot = IconName | { name: IconName; onClick: () => void; "aria-label": string };

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "size"> & {
  name: string;
  size?: Size;
  icon?: {
    start?: IconSlot;
    end?: IconSlot;
  };
};

const renderIconSlot = (slot: IconSlot, position: "start" | "end") => {
  // clsx() normalizes styles.iconStart/iconEnd (typed string | undefined under
  // noUncheckedIndexedAccess) to a plain string — both classes are always
  // defined in TextField.module.css, so this never actually drops a class.
  const positionClass = clsx(position === "start" ? styles.iconStart : styles.iconEnd);
  if (typeof slot === "string") {
    return <Icon name={slot} size="sm" className={positionClass} aria-hidden />;
  }
  return (
    <IconButton
      icon={slot.name}
      aria-label={slot["aria-label"]}
      onClick={slot.onClick}
      size="sm"
      variant="subtle"
      className={positionClass}
    />
  );
};

// Always wrapped in a <div>, even without an icon — a stable structure
// (e.g. a future <label> around the field) rather than one that reshapes
// depending on props.
export const TextField = ({ className, size = "md", icon, ...rest }: TextFieldProps) => {
  return (
    <div className={clsx(styles.wrapper, className)}>
      <Box
        as="input"
        border="thin"
        radius="md"
        className={clsx(
          styles.textField,
          styles[size],
          icon?.start && styles.hasIconStart,
          icon?.end && styles.hasIconEnd,
        )}
        {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      />
      {icon?.start ? renderIconSlot(icon.start, "start") : null}
      {icon?.end ? renderIconSlot(icon.end, "end") : null}
    </div>
  );
};
