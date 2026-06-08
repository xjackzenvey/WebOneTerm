"""WebSocket route for terminal emulation.

Bridges xterm.js in the browser to a remote SSH shell via asyncssh.
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.weboneterm.services.ssh_manager import ssh_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/terminal/{server_id}")
async def ws_terminal(websocket: WebSocket, server_id: int):
    """Handle a terminal WebSocket session.

    Accepts JSON messages from the browser:
      {"type": "stdin",   "data": "<text>"}
      {"type": "resize",  "cols": <int>, "rows": <int>}
      {"type": "ping"}

    Sends JSON messages back:
      {"type": "stdout",        "data": "<text>"}
      {"type": "disconnected",  "reason": "<text>"}
      {"type": "error",         "message": "<text>"}
      {"type": "pong"}
    """
    await websocket.accept()
    ws_key = str(uuid.uuid4())

    try:
        session = await ssh_manager.connect(server_id, ws_key)
    except Exception as e:
        logger.error("SSH connection failed for server %d: %s", server_id, e)
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close()
        return

    process = session.process

    # ── Background task: read stdout ──────────────────────────
    async def read_stdout():
        try:
            while True:
                data = await process.stdout.read(4096)
                if not data:
                    break
                # data is bytes (encoding=None)
                await websocket.send_json({
                    "type": "stdout",
                    "data": data.decode("utf-8", errors="replace"),
                })
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug("stdout reader ended: %s", e)
        finally:
            try:
                await websocket.send_json({
                    "type": "disconnected",
                    "reason": "Remote shell closed",
                })
            except Exception:
                pass

    # ── Background task: read stderr ──────────────────────────
    async def read_stderr():
        try:
            while True:
                data = await process.stderr.read(4096)
                if not data:
                    break
                await websocket.send_json({
                    "type": "stdout",  # merge into stdout stream
                    "data": data.decode("utf-8", errors="replace"),
                })
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    stdout_task = asyncio.create_task(read_stdout())
    stderr_task = asyncio.create_task(read_stderr())

    # ── Main loop: read from WebSocket → write to process ─────
    try:
        async for raw in websocket.iter_json():
            msg_type = raw.get("type")

            if msg_type == "stdin":
                data = raw.get("data", "")
                process.stdin.write(data.encode("utf-8"))

            elif msg_type == "resize":
                cols = raw.get("cols", 80)
                rows = raw.get("rows", 24)
                try:
                    process.change_term_size(cols, rows)
                except Exception:
                    pass

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected for server %d", server_id)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        # Cleanup
        stdout_task.cancel()
        stderr_task.cancel()
        await ssh_manager.disconnect(server_id, ws_key)
