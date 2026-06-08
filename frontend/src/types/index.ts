// TypeScript types for the application

export interface Server {
  id: number;
  alias: string;
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'private_key';
  has_password: boolean;
  has_private_key: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServerFormData {
  alias: string;
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'private_key';
  password?: string;
  private_key?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at: number | null;
  permissions: string;
}

export interface Tab {
  id: string;
  type: 'terminal' | 'files';
  serverId: number;
  title: string;
}

export type WSMessage =
  | { type: 'stdin'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' };

export type WSResponse =
  | { type: 'stdout'; data: string }
  | { type: 'disconnected'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };
