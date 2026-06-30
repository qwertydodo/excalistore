import { Cloud, Minus, Pencil, Plus, Shapes, Trash2, X } from "lucide-react";
import type { AriaAttributes } from "react";

const ICONS = {
  plus: Plus,
  minus: Minus,
  cross: X,
  edit: Pencil,
  trash: Trash2,
  diagrams: Shapes,
  cloud: Cloud,
} as const;

export type IconName = keyof typeof ICONS;

type IconSize = "sm" | "md" | "lg";

const SIZE_PX: Record<IconSize, number> = {
  sm: 14,
  md: 20,
  lg: 24,
};

type IconProps = AriaAttributes & {
  name: IconName;
  size?: IconSize;
  className?: string;
};

export const Icon = ({ name, size = "sm", className, ...aria }: IconProps) => {
  const LucideIcon = ICONS[name];
  return <LucideIcon size={SIZE_PX[size]} className={className} {...aria} />;
};
