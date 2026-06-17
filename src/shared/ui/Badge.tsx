import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger";

const colors: Record<Tone, string> = {
  neutral: "var(--es-muted)",
  success: "var(--es-accent)",
  danger: "var(--es-danger)",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span style={{ fontSize: 12, color: colors[tone] }}>{children}</span>;
}
