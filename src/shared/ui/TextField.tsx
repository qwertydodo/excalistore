import type { InputHTMLAttributes } from "react";

export function TextField({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{
        background: "var(--es-bg)",
        color: "var(--es-text)",
        border: "1px solid var(--es-border)",
        borderRadius: "var(--es-radius)",
        padding: "6px 8px",
        font: "inherit",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    />
  );
}
