import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import { Box } from "../Box";
import styles from "./TextField.module.css";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "aria-label"> &
  ({ name: string; "aria-label"?: string } | { name?: string; "aria-label": string });

export const TextField = ({ className, ...rest }: TextFieldProps) => {
  return (
    <Box
      as="input"
      border="thin"
      radius="md"
      className={clsx(styles.textField, className)}
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
    />
  );
};
