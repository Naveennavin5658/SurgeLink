"""Server-Sent Events endpoint for real-time transfer updates."""
import json
import time

from flask import Response, stream_with_context

from app.db import get_redis
from app.transfers import TRANSFER_EVENTS_CHANNEL


def sse_stream():
    """Generator that subscribes to Redis pub/sub and yields SSE events."""
    r = get_redis()
    pubsub = r.pubsub()
    pubsub.subscribe(TRANSFER_EVENTS_CHANNEL)

    try:
        # Send initial connection event
        yield f"data: {json.dumps({'type': 'connected'})}\n\n"

        while True:
            message = pubsub.get_message(timeout=1.0)
            if message and message["type"] == "message":
                yield f"data: {message['data']}\n\n"
            else:
                # Keep-alive ping every 15s
                yield f": keepalive {int(time.time())}\n\n"
    finally:
        pubsub.unsubscribe(TRANSFER_EVENTS_CHANNEL)
        pubsub.close()


def create_sse_response():
    return Response(
        stream_with_context(sse_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
