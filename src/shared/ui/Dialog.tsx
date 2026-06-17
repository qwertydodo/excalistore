import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}

export function Dialog({ title, children, onClose }: Props) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a mouse convenience; content is keyboard-dismissible via dialog buttons.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483647,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: "var(--es-bg)",
          color: "var(--es-text)",
          border: "1px solid var(--es-border)",
          borderRadius: "var(--es-radius)",
          boxShadow: "var(--es-shadow)",
          padding: 20,
          minWidth: 320,
          maxWidth: 420,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
