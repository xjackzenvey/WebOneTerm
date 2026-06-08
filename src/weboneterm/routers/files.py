"""REST API for remote file management via SFTP."""

import os
from typing import List

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from starlette.responses import StreamingResponse

from src.weboneterm.schemas import FileEntry, MkdirRequest
from src.weboneterm.services import file_ops

router = APIRouter(prefix="/api/servers/{server_id}/files", tags=["files"])


@router.get("", response_model=List[FileEntry])
async def list_directory(
    server_id: int,
    path: str = Query("/", description="Remote directory path to list"),
):
    """List files in a directory on the remote server."""
    try:
        return await file_ops.list_files(server_id, path)
    except file_ops.FileOpsError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to list files: {e}"
        )


@router.post("/upload", response_model=FileEntry, status_code=status.HTTP_201_CREATED)
async def upload_file(
    server_id: int,
    file: UploadFile,
    path: str = Form("/", description="Destination directory path on remote"),
):
    """Upload a file to the remote server."""
    try:
        return await file_ops.upload_file(server_id, file.file, file.filename, path)
    except file_ops.FileOpsError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to upload file: {e}"
        )


@router.get("/download")
async def download_file(
    server_id: int,
    path: str = Query(..., description="Full remote path of file to download"),
):
    """Download a file from the remote server (streaming)."""
    try:
        # Get file info first for the filename
        info = await file_ops.get_file_info(server_id, path)
        filename = info.name if info else os.path.basename(path)

        async def chunk_generator():
            try:
                async for chunk in file_ops.download_file_chunks(server_id, path):
                    yield chunk
            except Exception:
                pass

        return StreamingResponse(
            chunk_generator(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )
    except file_ops.FileOpsError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to download file: {e}"
        )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    server_id: int,
    path: str = Query(..., description="Full remote path to delete"),
):
    """Delete a file or empty directory on the remote server."""
    try:
        await file_ops.delete_file(server_id, path)
    except file_ops.FileOpsError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete: {e}"
        )


@router.post("/mkdir", response_model=FileEntry, status_code=status.HTTP_201_CREATED)
async def create_directory(
    server_id: int,
    body: MkdirRequest,
):
    """Create a new directory on the remote server."""
    try:
        return await file_ops.create_directory(server_id, body.path)
    except file_ops.FileOpsError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create directory: {e}"
        )
