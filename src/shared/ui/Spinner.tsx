export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid var(--es-border)",
        borderTopColor: "var(--es-accent)",
        borderRadius: "50%",
        animation: "es-spin 0.7s linear infinite",
      }}
    />
  );
}
