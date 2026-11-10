import React from "react";

interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "success" | "attention" | "done";
  children: React.ReactNode;
}

export function Label({ variant = "default", children, className = "", ...props }: LabelProps) {
  return (
    <span className={`Label Label--${variant} ${className}`} {...props}>
      {children}
    </span>
  );
}
