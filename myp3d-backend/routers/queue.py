from fastapi import APIRouter, HTTPException, Response

from models.schemas import QueueItem, QueueItemsCreate, QueueItemUpdate, QueueStartRequest
from services import queue_service

router = APIRouter(prefix="/queue", tags=["Queue"])


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


@router.post("/{item_id}/cancel", response_model=list[QueueItem])
def cancel_queue_item(item_id: int):
    return queue_service.cancel(item_id)


@router.post("/clear", response_model=list[QueueItem])
def clear_queue():
    return queue_service.clear_done()


@router.patch("/{item_id}", response_model=QueueItem)
def update_queue_item(item_id: int, payload: QueueItemUpdate):
    try:
        return queue_service.update_item(item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{item_id}")
def delete_queue_item(item_id: int):
    queue_service.delete_item(item_id)
    return {"success": True}


@router.get("/{item_id}/cover")
def get_queue_cover(item_id: int):
    cover = queue_service.get_cover(item_id)
    if cover is None:
        raise HTTPException(status_code=404, detail="No cover image found")
    return Response(content=cover, media_type="image/jpeg")
