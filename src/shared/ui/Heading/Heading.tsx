import type { ComponentPropsWithoutRef } from "react";
import { Text, type TextProps } from "../Text";

type HeadingTag = "h1" | "h2";
type HeadingSize = "md" | "lg";

type HeadingOwnProps = {
  as?: HeadingTag | undefined;
  size: HeadingSize;
};

type HeadingProps = HeadingOwnProps & Omit<ComponentPropsWithoutRef<"h2">, keyof HeadingOwnProps>;

export const Heading = ({ as = "h2", size, ...rest }: HeadingProps) => {
  return <Text as={as} size={size} {...(rest as TextProps<HeadingTag>)} />;
};
