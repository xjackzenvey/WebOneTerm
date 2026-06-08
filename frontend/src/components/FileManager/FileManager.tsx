// File Manager view — SFTP-based file browser

import { useState, useCallback } from 'react';
import { useFileManager } from '../../hooks/useFileManager';
import { FileToolbar } from './FileToolbar';
import { FileTable } from './FileTable';
import { Spinner } from '../common/Spinner';
import type { Server } from '../../types';
import './FileManager.css';

interface FileManagerProps {
  server: Server;
}

export function FileManager({ server }: FileManagerProps) {
  const {
    currentPath,
    entries,
    loading,
    error,
    navigateTo,
    goUp,
    uploadFiles,
    deleteEntry,
    createDir,
    loadFiles,
  } = useFileManager(server.id);

  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (filePaths: string[]) => {
      setUploading(true);
      await uploadFiles(filePaths);
      setUploading(false);
    },
    [uploadFiles]
  );

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <h2>File Manager</h2>
        <span className="file-manager-server">
          {server.username}@{server.host}:{server.port}
        </span>
      </div>

      <FileToolbar
        currentPath={currentPath}
        onNavigate={navigateTo}
        onGoUp={goUp}
        onUpload={handleUpload}
        onCreateDir={createDir}
        onRefresh={() => loadFiles()}
        uploading={uploading}
      />

      {error && (
        <div className="fm-error">{error}</div>
      )}

      {loading ? (
        <div className="fm-loading">
          <Spinner text="Loading files..." />
        </div>
      ) : (
        <FileTable
          entries={entries}
          serverId={server.id}
          onNavigate={navigateTo}
          onDelete={deleteEntry}
        />
      )}
    </div>
  );
}
