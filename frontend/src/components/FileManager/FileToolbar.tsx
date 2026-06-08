// File manager toolbar: breadcrumb nav, upload (native dialog), mkdir

import { useState } from 'react';
import { openFilesDialog } from '../../api/endpoints';
import { Spinner } from '../common/Spinner';
import './FileToolbar.css';

interface FileToolbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onUpload: (filePaths: string[]) => void;
  onCreateDir: (name: string) => void;
  onRefresh: () => void;
  uploading?: boolean;
}

export function FileToolbar({
  currentPath,
  onNavigate,
  onGoUp,
  onUpload,
  onCreateDir,
  onRefresh,
  uploading = false,
}: FileToolbarProps) {
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [dirName, setDirName] = useState('');

  const segments = currentPath === '/'
    ? ['/']
    : currentPath.split('/').filter(Boolean);

  function breadcrumbPath(idx: number): string {
    if (idx === 0) return '/';
    return '/' + segments.slice(0, idx + 1).join('/');
  }

  function handleMkdir() {
    const name = dirName.trim();
    if (!name) return;
    onCreateDir(name);
    setDirName('');
    setMkdirOpen(false);
  }

  async function handleUploadClick() {
    const paths = await openFilesDialog();
    if (paths.length > 0) {
      onUpload(paths);
    }
  }

  return (
    <div className="file-toolbar">
      <div className="toolbar-left">
        <button className="icon-btn" onClick={onGoUp} title="Go up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l-8 8h5v10h6V11h5l-8-8z" />
          </svg>
        </button>

        <nav className="breadcrumb">
          {segments.length === 0 || (segments.length === 1 && segments[0] === '') ? (
            <span className="breadcrumb-item active" onClick={() => onNavigate('/')}>/</span>
          ) : (
            <>
              <span className="breadcrumb-item" onClick={() => onNavigate('/')}>/</span>
              {segments.map((_s, idx) => (
                <span key={`sep-${idx}`} className="breadcrumb-sep">/</span>
              ))}
              {segments.map((seg, idx) => (
                <span
                  key={`seg-${idx}`}
                  className={`breadcrumb-item ${idx === segments.length - 1 ? 'active' : ''}`}
                  onClick={() => onNavigate(breadcrumbPath(idx))}
                >
                  {seg}
                </span>
              ))}
            </>
          )}
        </nav>

        {uploading && <Spinner text="Uploading..." />}
      </div>

      <div className="toolbar-right">
        <button className="btn btn-sm btn-secondary" onClick={onRefresh} title="Refresh">
          ↻ Refresh
        </button>

        <button className="btn btn-sm btn-secondary" onClick={() => setMkdirOpen(true)}>
          + Folder
        </button>

        <button
          className="btn btn-sm btn-primary"
          onClick={handleUploadClick}
          disabled={uploading}
        >
          ↑ Upload
        </button>
      </div>

      {mkdirOpen && (
        <div className="mkdir-popup">
          <input
            type="text"
            value={dirName}
            onChange={(e) => setDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleMkdir();
              if (e.key === 'Escape') setMkdirOpen(false);
            }}
            placeholder="Folder name"
            autoFocus
          />
          <button className="btn btn-sm btn-primary" onClick={handleMkdir}>Create</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setMkdirOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
