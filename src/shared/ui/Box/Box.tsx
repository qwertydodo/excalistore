import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Box.module.css";

export type Space = "1" | "2" | "3" | "4" | "5" | "6";

type BoxOwnProps = {
  padding?: Space | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
};

export type BoxProps<T extends ElementType> = BoxOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof BoxOwnProps> & { as?: T };

export const Box = <T extends ElementType = "div">({
  as,
  padding,
  className,
  ...rest
}: BoxProps<T>) => {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={[padding ? styles[`p-${padding}`] : null, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
};
