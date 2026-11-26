import type { ReactNode } from "react";
import { cn } from "@/components/clean-ui";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("ui-panel border border-border bg-surface", className)}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="stat-tile px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-soft">
        {label}
      </p>
      <p className="tabular mt-2 text-2xl font-semibold leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "positive";
}) {
  const tones = {
    neutral: "border-border bg-surface-muted text-muted",
    accent: "border-accent/20 bg-accent-soft text-accent",
    warning: "border-warning/20 bg-warning-soft text-warning",
    positive: "border-positive/20 bg-positive/5 text-positive",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? "bg-foreground text-white hover:bg-foreground/90"
      : "border border-border-strong bg-surface hover:bg-surface-muted";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex h-11 items-center justify-center rounded-sm px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", styles)}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="tabular h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm outline-none placeholder:text-muted-soft focus:border-foreground/30 disabled:bg-surface-muted"
    />
  );
}

export function DataRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-2.5 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="tabular text-right text-xs font-medium">{value}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted">{children}</div>
  );
}
