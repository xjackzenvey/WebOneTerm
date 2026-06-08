// A single server entry in the sidebar

import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { Server } from '../../types';
import './ServerItem.css';

interface ServerItemProps {
  server: Server;
}

export function ServerItem({ server }: ServerItemProps) {
  const { tabs, activeTabId, openTerminal, openFileManager, openEditForm, deleteServer } =
    useAppStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Highlight if any tab for this server is active
  const isActive = tabs.some(
    (t) => t.serverId === server.id && t.id === activeTabId
  );

  function handleDelete() {
    setShowDeleteConfirm(false);
    deleteServer(server.id);
  }

  return (
    <>
      <div className={`server-item ${isActive ? 'active' : ''}`}>
        <div className="server-item-main" title={`${server.username}@${server.host}:${server.port}`}>
          <div className="server-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <path d="M6 8l4 4-4 4M12 16h6" />
            </svg>
          </div>
          <div className="server-item-info">
            <div className="server-alias">{server.alias || server.host}</div>
            <div className="server-host">
              {server.username}@{server.host}:{server.port}
            </div>
          </div>
        </div>

        <div className="server-item-actions">
          <button
            className="icon-btn add-terminal"
            onClick={(e) => {
              e.stopPropagation();
              openTerminal(server);
            }}
            title="New terminal tab"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              openFileManager(server);
            }}
            title="File Manager"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              openEditForm(server);
            }}
            title="Edit Server"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            className="icon-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            title="Delete Server"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Server"
        message={`Are you sure you want to delete "${server.alias || server.host}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
