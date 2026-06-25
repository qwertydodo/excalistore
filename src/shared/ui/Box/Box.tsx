import clsx from "clsx";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Box.module.css";

export type Space = "1" | "2" | "3" | "4" | "5" | "6";
export type BorderWidth = "thin" | "thick";
export type Radius = "sm" | "md" | "lg";
export type Shadow = "sm" | "md" | "lg";

type BoxOwnProps = {
  padding?: Space | undefined;
  border?: BorderWidth | undefined;
  radius?: Radius | undefined;
  shadow?: Shadow | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
};

export type BoxProps<T extends ElementType> = BoxOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof BoxOwnProps> & { as?: T };

export const Box = <T extends ElementType = "div">({
  as,
  padding,
  border,
  radius,
  shadow,
  className,
  ...rest
}: BoxProps<T>) => {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={clsx(
        padding && styles[`p-${padding}`],
        border && styles[`border-${border}`],
        radius && styles[`radius-${radius}`],
        shadow && styles[`shadow-${shadow}`],
        className,
      )}
      {...rest}
    />
  );
};
