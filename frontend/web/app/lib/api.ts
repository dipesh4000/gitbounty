const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number | null;
  unreachable: boolean;

  constructor(message: string, options: { status?: number; unreachable?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.unreachable = options.unreachable ?? false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the GitBounty API.", { unreachable: true });
  }

  if (!response.ok) {
    let detail = `The API returned ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // A non-JSON error still has the useful status message above.
    }
    throw new ApiError(detail, { status: response.status });
  }

  return response.json() as Promise<T>;
}

export function apiGet<T>(path: string) {
  return request<T>(path);
}

export function apiPost<T>(path: string) {
  return request<T>(path, { method: "POST" });
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.unreachable) {
    return {
      title: "Can't reach the API",
      message: `Nothing is answering at ${API_BASE}. Start the backend and reload.`,
      detail: "cd backend && .venv/bin/uvicorn app.main:app --reload",
    };
  }
  return {
    title: "Something went wrong",
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
    detail: null,
  };
}

export { API_BASE };
