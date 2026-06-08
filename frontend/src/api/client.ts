// Tauri IPC wrapper — uses window.__TAURI__ global (withGlobalTauri: true)

function getInvoke() {
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__ as
    | { core?: { invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> } }
    | undefined;
  if (!tauri?.core?.invoke) {
    throw new Error('Tauri runtime not available. Run this app via `cargo tauri dev` or the built bundle.');
  }
  return tauri.core.invoke;
}

export async function request<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const invoke = getInvoke();
  return invoke<T>(cmd, args);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export const BASE_URL = '/api';
