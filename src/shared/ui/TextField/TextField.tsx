import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

export const TextField = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => {
  return <input className={[styles.textField, className].filter(Boolean).join(" ")} {...rest} />;
};
