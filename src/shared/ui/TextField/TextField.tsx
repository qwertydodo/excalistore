import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import { Box } from "../Box";
import styles from "./TextField.module.css";

type Size = "sm" | "md";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "size"> & {
  name: string;
  size?: Size;
};

export const TextField = ({ className, size = "md", ...rest }: TextFieldProps) => {
  return (
    <Box
      as="input"
      border="thin"
      radius="md"
      className={clsx(styles.textField, styles[size], className)}
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
    />
  );
};
