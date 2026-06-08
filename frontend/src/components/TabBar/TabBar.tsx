// Tab bar with right-click context menu for rename

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import './TabBar.css';

interface ContextMenu {
  x: number;
  y: number;
  tabId: string;
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, renameTab } = useAppStore();

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on any click outside
  useEffect(() => {
    function close() {
      setContextMenu(null);
    }
    if (contextMenu) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [contextMenu]);

  // Focus edit input when it appears
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  function handleClose(e: React.MouseEvent, tabId: string) {
    e.stopPropagation();
    closeTab(tabId);
  }

  function handleContextMenu(e: React.MouseEvent, tabId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }

  const startRename = useCallback((tabId: string, currentTitle: string) => {
    setContextMenu(null);
    setEditingTabId(tabId);
    setEditValue(currentTitle);
  }, []);

  function commitRename(tabId: string) {
    const trimmed = editValue.trim();
    if (trimmed) {
      renameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  }

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
        >
          <span className="tab-icon">
            {tab.type === 'terminal' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M6 8l4 4-4 4M12 16h6" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </span>

          {editingTabId === tab.id ? (
            <input
              ref={editInputRef}
              className="tab-rename-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(tab.id);
                if (e.key === 'Escape') setEditingTabId(null);
              }}
              onBlur={() => commitRename(tab.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tab-title">{tab.title}</span>
          )}

          <button
            className="tab-close"
            onClick={(e) => handleClose(e, tab.id)}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) startRename(tab.id, tab.title);
            }}
          >
            Rename
          </button>
        </div>
      )}
    </div>
  );
}
