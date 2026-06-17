import styles from "./Spinner.module.css";

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={styles.spinner}
      // Size-derived dimensions can't be static classes — they come from the `size` prop.
      style={{ width: size, height: size }}
    />
  );
}
