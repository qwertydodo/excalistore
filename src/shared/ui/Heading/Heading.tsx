import type { ComponentPropsWithoutRef } from "react";
import { Text, type TextProps } from "../Text";

type HeadingTag = "h1" | "h2";

type HeadingProps = {
  as?: HeadingTag;
} & Omit<ComponentPropsWithoutRef<"h2">, "as">;

const sizeByTag: Record<HeadingTag, "lg" | "md"> = { h1: "lg", h2: "md" };

export const Heading = ({ as = "h2", ...rest }: HeadingProps) => {
  return <Text as={as} size={sizeByTag[as]} {...(rest as TextProps<HeadingTag>)} />;
};
