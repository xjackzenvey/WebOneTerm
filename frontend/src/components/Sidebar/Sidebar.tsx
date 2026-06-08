// Left sidebar panel: header + server list + form modal

import { useAppStore } from '../../store/useAppStore';
import { ServerList } from './ServerList';
import { ServerForm } from './ServerForm';
import './Sidebar.css';

export function Sidebar() {
  const { openAddForm } = useAppStore();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">WebOneTerm</h1>
        <div className="sidebar-header-row">
          <span className="sidebar-subtitle">Servers</span>
          <button className="btn btn-primary btn-sm" onClick={openAddForm}>
            + Add
          </button>
        </div>
      </div>
      <ServerList />
      <ServerForm />
    </aside>
  );
}
