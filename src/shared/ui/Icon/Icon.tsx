import { Cloud, FolderOpen, Minus, Pencil, Search, Trash2, X } from "lucide-react";
import type { AriaAttributes } from "react";

const ICONS = {
  minus: Minus,
  edit: Pencil,
  trash: Trash2,
  folderOpen: FolderOpen,
  cloud: Cloud,
  search: Search,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

type IconSize = "sm" | "md" | "lg";

// sm mirrors --es-icon-size-sm (src/shared/config/theme.css) — components
// that lay out space for a size="sm" icon in CSS reference that token; keep
// both in sync if either changes.
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
