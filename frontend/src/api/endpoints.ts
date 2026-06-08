// Typed API functions — Tauri IPC transport

import { request } from './client';
import type { Server, ServerFormData, FileEntry } from '../types';

function getDialog() {
  return (window as unknown as Record<string, unknown>).__TAURI__ as {
    dialog?: {
      open?: (opts?: { multiple?: boolean; title?: string }) => Promise<string | string[] | null>;
      save?: (opts?: { defaultPath?: string; title?: string }) => Promise<string | null>;
    };
  } | undefined;
}

// ── Server CRUD ─────────────────────────────────────────────────

export async function getServers(): Promise<Server[]> {
  return request<Server[]>('list_servers');
}

export async function getServer(id: number): Promise<Server> {
  return request<Server>('get_server', { serverId: id });
}

export async function createServer(data: ServerFormData): Promise<Server> {
  return request<Server>('create_server', { data });
}

export async function updateServer(
  id: number,
  data: Partial<ServerFormData>
): Promise<Server> {
  return request<Server>('update_server', { serverId: id, data });
}

export async function deleteServer(id: number): Promise<void> {
  return request<void>('delete_server', { serverId: id });
}

// ── File operations ─────────────────────────────────────────────

export async function getFiles(
  serverId: number,
  path: string = '/'
): Promise<FileEntry[]> {
  return request<FileEntry[]>('list_files', { serverId, path });
}

export async function uploadFile(
  serverId: number,
  fileOrPath: File | string,
  destPath: string
): Promise<FileEntry> {
  // If it's a string, it's already a local path
  if (typeof fileOrPath === 'string') {
    return request<FileEntry>('upload_file', {
      serverId,
      localPath: fileOrPath,
      destPath,
    });
  }
  // Fallback: browser File object — not used in Tauri mode
  throw new Error('File upload requires a local path in Tauri mode');
}

export async function downloadFile(
  serverId: number,
  remotePath: string,
  filename: string
): Promise<void> {
  // Open native save dialog
  const dialog = getDialog();
  if (!dialog?.dialog?.save) return;
  const savePath = await dialog.dialog.save({
    defaultPath: filename,
    title: 'Save file as',
  });
  if (!savePath) return; // user cancelled

  return request<void>('download_file', {
    serverId,
    remotePath,
    localPath: savePath,
  });
}

export function getDownloadUrl(_serverId: number, _filePath: string): string {
  // Not used in Tauri mode — download is handled via save dialog + invoke
  return '';
}

export async function deleteFile(
  serverId: number,
  path: string
): Promise<void> {
  return request<void>('delete_file', { serverId, path });
}

export async function createDirectory(
  serverId: number,
  path: string
): Promise<FileEntry> {
  return request<FileEntry>('create_directory', { serverId, path });
}

// ── File dialog helpers ─────────────────────────────────────────

export async function openFileDialog(): Promise<string | null> {
  const dialog = getDialog();
  if (!dialog?.dialog?.open) return null;
  const selected = await dialog.dialog.open({
    multiple: false,
    title: 'Select file to upload',
  });
  if (selected && typeof selected === 'string') return selected;
  if (selected && Array.isArray(selected) && selected.length > 0) {
    return selected[0] as string;
  }
  return null;
}

export async function openFilesDialog(): Promise<string[]> {
  const dialog = getDialog();
  if (!dialog?.dialog?.open) return [];
  const selected = await dialog.dialog.open({
    multiple: true,
    title: 'Select files to upload',
  });
  if (!selected) return [];
  if (Array.isArray(selected)) return selected as string[];
  return [selected as string];
}
