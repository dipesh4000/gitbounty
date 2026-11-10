import React from "react";

interface CounterProps extends React.HTMLAttributes<HTMLSpanElement> {
  count: number | string;
  variant?: "default" | "primary";
}

export function Counter({ count, variant = "default", className = "", ...props }: CounterProps) {
  const variantClass = variant === "primary" ? "Counter--primary" : "";
  return (
    <span className={`Counter ${variantClass} ${className}`} {...props}>
      {count}
    </span>
  );
}
