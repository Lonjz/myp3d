from fastapi import APIRouter, HTTPException, Response

from models.schemas import QueueItem, QueueItemsCreate, QueueItemUpdate, QueueStartRequest
from services import queue_service
from services.queue_service import QueueError

router = APIRouter(prefix="/queue", tags=["Queue"])


def _raise(exc: QueueError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("", response_model=list[QueueItem])
def list_queue():
    return queue_service.list_items()


@router.post("", response_model=list[QueueItem])
def add_to_queue(payload: QueueItemsCreate):
    try:
        return queue_service.add_items(payload.items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/start", response_model=list[QueueItem])
def start_queue(payload: QueueStartRequest):
    return queue_service.start(payload.ids)


@router.post("/stop", response_model=list[QueueItem])
def stop_queue():
    return queue_service.stop()


@router.post("/clear", response_model=list[QueueItem])
def clear_queue():
    return queue_service.clear_done()


@router.patch("/{item_id}", response_model=QueueItem)
def update_queue_item(item_id: int, payload: QueueItemUpdate):
    try:
        return queue_service.update_item(item_id, payload)
    except QueueError as exc:
        _raise(exc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{item_id}")
def delete_queue_item(item_id: int):
    try:
        queue_service.delete_item(item_id)
    except QueueError as exc:
        _raise(exc)
    return {"success": True}


@router.get("/{item_id}/cover")
def get_queue_cover(item_id: int):
    try:
        cover = queue_service.get_cover(item_id)
    except QueueError as exc:
        _raise(exc)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    return Response(content=cover, media_type="image/jpeg")
