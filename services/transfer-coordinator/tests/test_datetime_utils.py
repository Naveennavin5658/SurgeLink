from datetime import datetime, timezone

from app.db import ensure_aware_datetime


def test_ensure_aware_datetime_normalizes_naive_values():
    naive = datetime(2026, 8, 9, 12, 0, 0)
    normalized = ensure_aware_datetime(naive)

    assert normalized.tzinfo is not None
    assert normalized.utcoffset() == timezone.utc.utcoffset(normalized)


def test_ensure_aware_datetime_leaves_aware_values_unchanged():
    aware = datetime(2026, 8, 9, 12, 0, 0, tzinfo=timezone.utc)

    assert ensure_aware_datetime(aware) == aware
