import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, style, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        background: "transparent",
        border: "none",
        borderRadius: "var(--es-radius)",
        color: "var(--es-text)",
        cursor: "pointer",
        padding: 4,
        display: "inline-flex",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
