// Global application state (zustand + localStorage persistence)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Server, ServerFormData, Tab } from '../types';
import * as api from '../api/endpoints';

function newTabId(): string {
  return crypto.randomUUID();
}

// ── Persisted state shape (only what survives refresh) ──────────

interface PersistedState {
  tabs: Tab[];
  activeTabId: string | null;
}

// ── Full state shape ────────────────────────────────────────────

interface AppState extends PersistedState {
  // Data (fetched from server, NOT persisted)
  servers: Server[];
  loading: boolean;
  error: string | null;

  // Form state (NOT persisted)
  isFormOpen: boolean;
  editingServer: Server | null;

  // Actions
  fetchServers: () => Promise<void>;

  openTerminal: (server: Server) => void;
  openFileManager: (server: Server) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, newTitle: string) => void;

  openAddForm: () => void;
  openEditForm: (server: Server) => void;
  closeForm: () => void;
  createServer: (data: ServerFormData) => Promise<void>;
  updateServer: (id: number, data: Partial<ServerFormData>) => Promise<void>;
  deleteServer: (id: number) => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Data ──
      servers: [],
      loading: false,
      error: null,

      // ── Tab state (persisted) ──
      tabs: [],
      activeTabId: null,

      // ── Form state ──
      isFormOpen: false,
      editingServer: null,

      // ── Server actions ──

      fetchServers: async () => {
        set({ loading: true, error: null });
        try {
          const servers = await api.getServers();
          set({ servers, loading: false });
        } catch (err) {
          set({ error: String(err), loading: false });
        }
      },

      // ── Tab actions ──

      openTerminal: (server: Server) => {
        // Always create a new terminal tab (used by the + button)
        const { tabs } = get();
        const tab: Tab = {
          id: newTabId(),
          type: 'terminal',
          serverId: server.id,
          title: server.alias || server.host,
        };
        set({ tabs: [...tabs, tab], activeTabId: tab.id });
      },

      openFileManager: (server: Server) => {
        const { tabs } = get();
        const existing = tabs.find(
          (t) => t.serverId === server.id && t.type === 'files'
        );
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const tab: Tab = {
          id: newTabId(),
          type: 'files',
          serverId: server.id,
          title: `${server.alias || server.host} · Files`,
        };
        set({ tabs: [...tabs, tab], activeTabId: tab.id });
      },

      closeTab: (tabId: string) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === tabId);
        const newTabs = tabs.filter((t) => t.id !== tabId);

        let newActive = activeTabId;
        if (activeTabId === tabId) {
          if (newTabs.length === 0) {
            newActive = null;
          } else if (idx < newTabs.length) {
            newActive = newTabs[idx].id;
          } else {
            newActive = newTabs[newTabs.length - 1].id;
          }
        }

        set({ tabs: newTabs, activeTabId: newActive });
      },

      setActiveTab: (tabId: string) => {
        set({ activeTabId: tabId });
      },

      renameTab: (tabId: string, newTitle: string) => {
        const { tabs } = get();
        set({
          tabs: tabs.map((t) =>
            t.id === tabId ? { ...t, title: newTitle } : t
          ),
        });
      },

      // ── Form actions ──

      openAddForm: () => {
        set({ isFormOpen: true, editingServer: null });
      },

      openEditForm: (server: Server) => {
        set({ isFormOpen: true, editingServer: server });
      },

      closeForm: () => {
        set({ isFormOpen: false, editingServer: null });
      },

      createServer: async (data: ServerFormData) => {
        await api.createServer(data);
        await get().fetchServers();
        set({ isFormOpen: false, editingServer: null });
      },

      updateServer: async (id: number, data: Partial<ServerFormData>) => {
        await api.updateServer(id, data);
        await get().fetchServers();
        set({ isFormOpen: false, editingServer: null });
      },

      deleteServer: async (id: number) => {
        await api.deleteServer(id);
        const { tabs, activeTabId } = get();
        const newTabs = tabs.filter((t) => t.serverId !== id);
        let newActive = activeTabId;
        if (tabs.some((t) => t.serverId === id && t.id === activeTabId)) {
          newActive = newTabs.length > 0 ? newTabs[0].id : null;
        }
        set({ tabs: newTabs, activeTabId: newActive });
        await get().fetchServers();
      },
    }),
    {
      name: 'weboneterm-tabs',
      partialize: (state): PersistedState => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    }
  )
);
