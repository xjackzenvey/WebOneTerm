// File list table with actions (Tauri-native download via save dialog)

import { useState } from 'react';
import { downloadFile } from '../../api/endpoints';
import { Spinner } from '../common/Spinner';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { FileEntry } from '../../types';
import './FileTable.css';

interface FileTableProps {
  entries: FileEntry[];
  serverId: number;
  onNavigate: (path: string) => void;
  onDelete: (entry: FileEntry) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return i === 0 ? `${size} ${units[i]}` : `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(ts: number | null): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

export function FileTable({ entries, serverId, onNavigate, onDelete }: FileTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  async function handleDownload(entry: FileEntry) {
    setDownloadingPath(entry.path);
    try {
      await downloadFile(serverId, entry.path, entry.name);
    } catch (err) {
      if (String(err) !== '') {
        alert(`Download failed: ${err}`);
      }
      // Empty error = user cancelled the save dialog
    } finally {
      setDownloadingPath(null);
    }
  }

  return (
    <>
      <div className="file-table-wrapper">
        <table className="file-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-size">Size</th>
              <th className="col-mod">Modified</th>
              <th className="col-perm">Permissions</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-dir">
                  Directory is empty
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const isDownloading = downloadingPath === entry.path;
              return (
                <tr key={entry.path} className="file-row">
                  <td>
                    <span
                      className={`file-name ${entry.is_dir ? 'is-dir' : ''}`}
                      onClick={() => entry.is_dir && onNavigate(entry.path)}
                    >
                      <span className="file-icon">
                        {entry.is_dir ? '📁' : '📄'}
                      </span>
                      {entry.name}
                    </span>
                  </td>
                  <td className="col-size">{entry.is_dir ? '-' : formatSize(entry.size)}</td>
                  <td className="col-mod">{formatDate(entry.modified_at)}</td>
                  <td className="col-perm">
                    <code>{entry.permissions}</code>
                  </td>
                  <td className="col-actions">
                    {isDownloading ? (
                      <Spinner />
                    ) : (
                      <>
                        {!entry.is_dir && (
                          <button
                            className="icon-btn"
                            onClick={() => handleDownload(entry)}
                            title="Download"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        )}
                        <button
                          className="icon-btn danger"
                          onClick={() => setDeleteTarget(entry)}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete File"
        message={
          deleteTarget?.is_dir
            ? `Delete directory "${deleteTarget?.name}"? It must be empty.`
            : `Delete file "${deleteTarget?.name}"? This cannot be undone.`
        }
        onConfirm={() => {
          if (deleteTarget) {
            onDelete(deleteTarget);
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
