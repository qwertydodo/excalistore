import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Text.module.css";

export type TextSize = "xs" | "sm" | "base" | "md" | "lg" | "xl";
export type TextColor = "text" | "muted" | "danger" | "accent" | "accent-text";

type TextOwnProps = {
  size?: TextSize;
  color?: TextColor;
  className?: string;
  children?: ReactNode;
};

export type TextProps<T extends ElementType> = TextOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps> & { as?: T };

export const Text = <T extends ElementType = "span">({
  as,
  size,
  color,
  className,
  ...rest
}: TextProps<T>) => {
  const Tag = (as ?? "span") as ElementType;
  return (
    <Tag
      className={[
        size ? styles[`size-${size}`] : null,
        color ? styles[`color-${color}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...(rest as TextProps<T>)}
    />
  );
};
