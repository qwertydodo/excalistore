import { TextField, type TextFieldProps } from "../TextField";

type SearchFieldProps = Omit<TextFieldProps, "icon" | "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
};

export const SearchField = ({ value, onChange, ...rest }: SearchFieldProps) => {
  const icon = {
    start: "search" as const,
    ...(value && {
      end: { name: "x" as const, onClick: () => onChange(""), "aria-label": "Clear search" },
    }),
  };

  return (
    <TextField {...rest} value={value} onChange={(e) => onChange(e.target.value)} icon={icon} />
  );
};
