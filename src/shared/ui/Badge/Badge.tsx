import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type Tone = "neutral" | "success" | "danger";

export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => {
  return <span className={clsx(styles.badge, styles[tone])}>{children}</span>;
};
