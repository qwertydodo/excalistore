import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Tone = "neutral" | "success" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={[styles.badge, styles[tone]].filter(Boolean).join(" ")}>{children}</span>;
}
