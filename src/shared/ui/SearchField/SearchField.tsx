import { TextField } from "../TextField";

type SearchFieldProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
};

export const SearchField = ({
  name,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: SearchFieldProps) => {
  const icon = {
    start: "search" as const,
    ...(value && {
      end: { name: "x" as const, onClick: () => onChange(""), "aria-label": "Clear search" },
    }),
  };

  return (
    <TextField
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      icon={icon}
    />
  );
};
