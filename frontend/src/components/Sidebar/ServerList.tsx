// Server list in the sidebar, maps over servers

import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ServerItem } from './ServerItem';
import './ServerList.css';

export function ServerList() {
  const { servers, loading, error, fetchServers } = useAppStore();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  if (loading) {
    return <div className="server-list-msg">Loading...</div>;
  }

  if (error) {
    return <div className="server-list-msg error">{error}</div>;
  }

  if (servers.length === 0) {
    return (
      <div className="server-list-msg">
        <p>No servers added</p>
        <p className="hint">Click "+ Add" to add your first SSH server</p>
      </div>
    );
  }

  return (
    <div className="server-list">
      {servers.map((s) => (
        <ServerItem key={s.id} server={s} />
      ))}
    </div>
  );
}
