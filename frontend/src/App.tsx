// Root application component — layout shell with tab-based navigation

import { useAppStore } from './store/useAppStore';
import { Sidebar } from './components/Sidebar/Sidebar';
import { TabBar } from './components/TabBar/TabBar';
import { TerminalView } from './components/Terminal/TerminalView';
import { FileManager } from './components/FileManager/FileManager';
import './App.css';

function App() {
  const { servers, tabs, activeTabId } = useAppStore();

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <TabBar />
        <div className="content-body">
          {tabs.length === 0 && (
            <div className="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M6 8l4 4-4 4M12 16h6" />
              </svg>
              <h2>WebOneTerm</h2>
              <p>
                Select a server from the sidebar to start a terminal session, or
                add a new one. File manager opens in a separate tab.
              </p>
            </div>
          )}

          {/* Render ALL tabs, only show the active one.
              This keeps WebSocket connections and component state alive
              across tab switches — no reconnect on tab change. */}
          {tabs.map((tab) => {
            const server = servers.find((s) => s.id === tab.serverId);
            if (!server) return null;

            const isActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                className="tab-content"
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                {tab.type === 'terminal' && (
                  <TerminalView server={server} />
                )}
                {tab.type === 'files' && (
                  <FileManager server={server} />
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default App;
