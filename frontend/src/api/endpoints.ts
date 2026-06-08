// Typed API endpoint functions

import { request } from './client';
import type { Server, ServerFormData, FileEntry } from '../types';

// ── Server CRUD ─────────────────────────────────────────────────

export async function getServers(): Promise<Server[]> {
  return request<Server[]>('/servers');
}

export async function getServer(id: number): Promise<Server> {
  return request<Server>(`/servers/${id}`);
}

export async function createServer(data: ServerFormData): Promise<Server> {
  return request<Server>('/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateServer(
  id: number,
  data: Partial<ServerFormData>
): Promise<Server> {
  return request<Server>(`/servers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteServer(id: number): Promise<void> {
  return request<void>(`/servers/${id}`, { method: 'DELETE' });
}

// ── File operations ─────────────────────────────────────────────

export async function getFiles(
  serverId: number,
  path: string = '/'
): Promise<FileEntry[]> {
  return request<FileEntry[]>(
    `/servers/${serverId}/files?path=${encodeURIComponent(path)}`
  );
}

export async function uploadFile(
  serverId: number,
  file: File,
  path: string
): Promise<FileEntry> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', path);

  const url = `/api/servers/${serverId}/files/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body);
  }

  return response.json();
}

export function getDownloadUrl(serverId: number, filePath: string): string {
  return `/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`;
}

export async function deleteFile(
  serverId: number,
  path: string
): Promise<void> {
  return request<void>(
    `/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
    { method: 'DELETE' }
  );
}

export async function createDirectory(
  serverId: number,
  path: string
): Promise<FileEntry> {
  return request<FileEntry>(`/servers/${serverId}/files/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}
