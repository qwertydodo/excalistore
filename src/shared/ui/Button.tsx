import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const bg: Record<Variant, string> = {
  primary: "var(--es-accent)",
  secondary: "var(--es-surface)",
  danger: "var(--es-danger)",
};

export function Button({ variant = "primary", style, ...rest }: Props) {
  return (
    <button
      type="button"
      style={{
        background: bg[variant],
        color: variant === "secondary" ? "var(--es-text)" : "var(--es-accent-text)",
        border: "1px solid var(--es-border)",
        borderRadius: "var(--es-radius)",
        padding: "6px 12px",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        font: "inherit",
        ...style,
      }}
      {...rest}
    />
  );
}
