"use client";

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "purple";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  size?: "sm" | "md";
}

const variantMap: Record<BadgeVariant, string> = {
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-yellow-100 text-yellow-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
  purple: "bg-purple-100 text-purple-700",
};

export function Badge({ variant, children, size = "sm" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${variantMap[variant]} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {children}
    </span>
  );
}
