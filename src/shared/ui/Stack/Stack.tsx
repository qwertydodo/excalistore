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
      className={[
        styles.stack,
        direction === "row" ? styles.row : styles.column,
        gap ? styles[`gap-${gap}`] : null,
        align ? styles[`align-${align}`] : null,
        justify ? styles[`justify-${justify}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...(rest as BoxProps<T>)}
    />
  );
};
