import styles from "./Spinner.module.css";

type SpinnerSize = "sm" | "md" | "lg";

// Mirrors Icon's own size-scale pattern (src/shared/ui/Icon/Icon.tsx) — named
// sizes instead of arbitrary pixel props. `md` keeps the pre-existing default
// visual size so callers that don't pass `size` are unaffected.
const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 14,
  md: 16,
  lg: 24,
};

type Props = {
  size?: SpinnerSize;
};

export const Spinner = ({ size = "md" }: Props) => {
  const px = SIZE_PX[size];
  return (
    <span
      role="status"
      aria-label="loading"
      className={styles.spinner}
      // Size-derived dimensions can't be static classes — they come from the scale above.
      style={{ width: px, height: px }}
    />
  );
};
