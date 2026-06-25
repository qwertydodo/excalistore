import type { InputHTMLAttributes } from "react";
import { Box } from "../Box";
import styles from "./TextField.module.css";

export const TextField = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <Box
      as="input"
      border="thin"
      radius="md"
      className={[styles.textField, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
};
