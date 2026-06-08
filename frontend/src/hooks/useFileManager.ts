// File manager state management hook

import { useState, useCallback, useEffect } from 'react';
import * as api from '../api/endpoints';
import type { FileEntry } from '../types';

export function useFileManager(serverId: number) {
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (path?: string) => {
      const targetPath = path ?? currentPath;
      setLoading(true);
      setError(null);
      try {
        const files = await api.getFiles(serverId, targetPath);
        setEntries(files);
        setCurrentPath(targetPath);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [serverId, currentPath]
  );

  useEffect(() => {
    loadFiles('/');
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = useCallback(
    (path: string) => {
      loadFiles(path);
    },
    [loadFiles]
  );

  const goUp = useCallback(() => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadFiles(parent);
  }, [currentPath, loadFiles]);

  const uploadFiles = useCallback(
    async (filePaths: string[]) => {
      setError(null);
      for (const filePath of filePaths) {
        try {
          await api.uploadFile(serverId, filePath, currentPath);
        } catch (err) {
          const name = filePath.split('/').pop() || filePath;
          setError(`Upload failed for ${name}: ${err}`);
        }
      }
      await loadFiles();
    },
    [serverId, currentPath, loadFiles]
  );

  const deleteEntry = useCallback(
    async (entry: FileEntry) => {
      setError(null);
      try {
        await api.deleteFile(serverId, entry.path);
        await loadFiles();
      } catch (err) {
        setError(`Delete failed: ${err}`);
      }
    },
    [serverId, loadFiles]
  );

  const createDir = useCallback(
    async (name: string) => {
      setError(null);
      const newPath =
        currentPath === '/'
          ? `/${name}`
          : `${currentPath}/${name}`;
      try {
        await api.createDirectory(serverId, newPath);
        await loadFiles();
      } catch (err) {
        setError(`Mkdir failed: ${err}`);
      }
    },
    [serverId, currentPath, loadFiles]
  );

  return {
    currentPath,
    entries,
    loading,
    error,
    loadFiles,
    navigateTo,
    goUp,
    uploadFiles,
    deleteEntry,
    createDir,
  };
}
