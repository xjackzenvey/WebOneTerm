// xterm.js terminal lifecycle + Tauri event streaming

import { useEffect, useRef, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// Use global Tauri APIs (withGlobalTauri: true)
function getTauri() {
  return (window as unknown as Record<string, unknown>).__TAURI__ as {
    core?: { invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
    event?: { listen?: <T>(event: string, handler: (e: { payload: T }) => void) => Promise<() => void> };
  } | undefined;
}

export function useTerminal(
  serverId: number,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const termRef = useRef<Terminal | null>(null);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tauri = getTauri();
    if (!tauri?.core?.invoke || !tauri?.event?.listen) return;

    const invoke = tauri.core.invoke;
    const listen = tauri.event.listen;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

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
    term.loadAddon(fitAddon);

    // 3. Mount terminal
    term.open(container);
    fitAddon.fit();

    // 4. Start terminal session
    async function startSession() {
      try {
        const key: string = await invoke('start_terminal', { serverId });
        if (cancelled) return;
        sessionKeyRef.current = key;

        const eventName = `terminal-event-${key}`;

        unlisten = await listen<{ type: string; data?: string; reason?: string; message?: string }>(
          eventName,
          (event) => {
            const msg = event.payload;
            switch (msg.type) {
              case 'stdout':
                term.write(msg.data ?? '');
                break;
              case 'disconnected':
                term.write(`\r\n\x1b[33m--- ${msg.reason ?? 'Disconnected'} ---\x1b[0m\r\n`);
                break;
              case 'error':
                term.write(`\r\n\x1b[31mConnection error: ${msg.message}\x1b[0m\r\n`);
                break;
              case 'pong':
                break;
            }
          }
        );

        // Now that we're listening, tell backend to start reading
        await invoke('start_reading', { sessionKey: key });

        // Send initial resize
        const dims = fitAddon.proposeDimensions();
        if (dims?.cols != null && dims?.rows != null) {
          invoke('resize_terminal', { sessionKey: key, cols: dims.cols, rows: dims.rows }).catch(() => {});
        }
      } catch (err) {
        term.write(`\r\n\x1b[31mFailed to connect: ${err}\x1b[0m\r\n`);
      }
    }

    startSession();

    // 5. User input — focus terminal on click
    const clickHandler = () => term.focus();
    term.element?.addEventListener('click', clickHandler, true);

    term.onData((data) => {
      const key = sessionKeyRef.current;
      if (key) {
        invoke('write_terminal', { sessionKey: key, data }).catch((err) => {
          term.write(`\r\n\x1b[31mWrite error: ${err}\x1b[0m\r\n`);
        });
      }
    });

    // 6. Resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const key = sessionKeyRef.current;
      if (!key) return;
      const dims = fitAddon.proposeDimensions();
      if (dims?.cols != null && dims?.rows != null) {
        invoke('resize_terminal', { sessionKey: key, cols: dims.cols, rows: dims.rows }).catch(() => {});
      }
    });
    resizeObserver.observe(container);

    // 7. Cleanup
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if (unlisten) unlisten();
      const key = sessionKeyRef.current;
      if (key) {
        invoke('close_terminal', { sessionKey: key }).catch(() => {});
      }
      term.dispose();
    };
  }, [serverId]);

  return { terminal: termRef.current };
}
