import React from "react";

export function Box({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`Box ${className}`} {...props}>
      {children}
    </div>
  );
}

export function BoxHeader({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`Box-header ${className}`} {...props}>
      {children}
    </div>
  );
}

export function BoxBody({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`Box-body ${className}`} {...props}>
      {children}
    </div>
  );
}

export function BoxRow({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`Box-row ${className}`} {...props}>
      {children}
    </div>
  );
}

export function BoxFooter({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`Box-footer ${className}`} {...props}>
      {children}
    </div>
  );
}
