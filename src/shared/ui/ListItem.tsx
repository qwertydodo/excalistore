import type { ReactNode } from "react";

interface Props {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function ListItem({ active = false, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "none",
        width: "100%",
        textAlign: "left",
        borderRadius: "var(--es-radius)",
        background: active ? "var(--es-surface)" : "transparent",
        color: "var(--es-text)",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {children}
    </button>
  );
}
