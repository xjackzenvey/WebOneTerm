// Terminal view — xterm.js terminal emulator

import { useRef } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import type { Server } from '../../types';
import './TerminalView.css';

interface TerminalViewProps {
  server: Server;
}

export function TerminalView({ server }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminal(server.id, containerRef);

  return (
    <div className="terminal-view">
      <div className="terminal-header">
        <span className="terminal-title">{server.alias || server.host}</span>
        <span className="terminal-connection">
          {server.username}@{server.host}:{server.port}
        </span>
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}
