import { apiErrorMessage } from "../lib/api";

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="board" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index} />)}
    </div>
  );
}

export function State({ title, message, children }: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const state = apiErrorMessage(error);
  return (
    <State title={state.title} message={state.message}>
      {state.detail ? <p className="app-section-note">{state.detail}</p> : null}
    </State>
  );
}
