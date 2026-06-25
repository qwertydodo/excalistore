import clsx from "clsx";
import type { ElementType } from "react";
import { Box, type BoxProps, type Space } from "../Box";
import styles from "./Stack.module.css";

type Direction = "row" | "column";
type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";

type StackOwnProps = {
  direction?: Direction | undefined;
  gap?: Space | undefined;
  align?: Align | undefined;
  justify?: Justify | undefined;
};

export type StackProps<T extends ElementType> = StackOwnProps & BoxProps<T>;

export const Stack = <T extends ElementType = "div">({
  direction = "column",
  gap,
  align,
  justify,
  className,
  ...rest
}: StackProps<T>) => {
  return (
    <Box
      className={clsx(
        styles.stack,
        direction === "row" ? styles.row : styles.column,
        gap && styles[`gap-${gap}`],
        align && styles[`align-${align}`],
        justify && styles[`justify-${justify}`],
        className,
      )}
      {...(rest as BoxProps<T>)}
    />
  );
};
