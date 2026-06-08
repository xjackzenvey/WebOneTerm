// xterm.js terminal lifecycle + WebSocket management

import { useEffect, useRef, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function useTerminal(
  serverId: number,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Create terminal
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      allowTransparency: false,
      scrollback: 5000,
    });
    termRef.current = term;

    // 2. Fit addon
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // 3. Mount terminal
    term.open(container);
    fitAddon.fit();

    // 4. Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${serverId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial terminal size
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            cols: dims.cols,
            rows: dims.rows,
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'stdout':
            term.write(msg.data);
            break;
          case 'disconnected':
            term.write(
              `\r\n\x1b[33m--- ${msg.reason} ---\x1b[0m\r\n`
            );
            break;
          case 'error':
            term.write(
              `\r\n\x1b[31mConnection error: ${msg.message}\x1b[0m\r\n`
            );
            break;
          case 'pong':
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[33m--- Connection closed ---\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write(
        '\r\n\x1b[31m--- WebSocket error ---\x1b[0m\r\n'
      );
    };

    // 5. User input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stdin', data }));
      }
    });

    // 6. Resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            cols: dims.cols,
            rows: dims.rows,
          })
        );
      }
    });
    resizeObserver.observe(container);

    // 7. Cleanup
    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [serverId]); // re-create if serverId changes

  return { terminal: termRef.current };
}
