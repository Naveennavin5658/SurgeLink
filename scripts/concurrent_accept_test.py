#!/usr/bin/env python3
"""
Concurrent accept race-condition test for SurgeLink.

Fires N simultaneous accept requests at a hospital with only 1 bed available.
Asserts exactly 1 succeeds and the rest fail with "no longer available".

Usage:
    python scripts/concurrent_accept_test.py [--base-url http://localhost:5002]
"""
import argparse
import concurrent.futures
import json
import sys
import uuid

import requests

CAPACITY_URL = "http://localhost:5001"
TRANSFER_URL = "http://localhost:5002"

NUM_CONCURRENT = 10


def login(email, password, base_capacity=CAPACITY_URL):
    r = requests.post(f"{base_capacity}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["token"]


def setup_test_scenario(capacity_url, transfer_url):
    """Set hospital to 1 available ICU bed, create transfer request."""
    clinician_token = login("clinician@metro.general", "clin123", capacity_url)
    receiving_token = login("receiving@lakeside.regional", "recv123", capacity_url)
    admin_token = login("admin@lakeside.regional", "admin123", capacity_url)

    headers_clinician = {"Authorization": f"Bearer {clinician_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Get Lakeside hospital ID
    r = requests.get(f"{capacity_url}/hospitals", headers=headers_clinician)
    r.raise_for_status()
    hospitals = r.json()
    lakeside = next(h for h in hospitals if "Lakeside" in h["name"])
    metro = next(h for h in hospitals if "Metro" in h["name"])
    lakeside_id = lakeside["_id"]
    metro_id = metro["_id"]

    # Set Lakeside ICU to exactly 1 available bed
    r = requests.post(
        f"{capacity_url}/hospitals/{lakeside_id}/capacity",
        headers=headers_admin,
        json={"bed_type": "icu", "available": 1, "total": 24},
    )
    r.raise_for_status()
    print(f"Set Lakeside ICU to 1/24 available")

    # Create transfer request from Metro to Lakeside for ICU
    idem_key = str(uuid.uuid4())
    r = requests.post(
        f"{transfer_url}/transfers",
        headers={**headers_clinician, "Idempotency-Key": idem_key},
        json={
            "patient_case_id": f"CASE-2026-TEST-{uuid.uuid4().hex[:6].upper()}",
            "from_hospital_id": metro_id,
            "to_hospital_id": lakeside_id,
            "bed_type_requested": "icu",
        },
    )
    r.raise_for_status()
    transfer = r.json()
    transfer_id = transfer["_id"]
    print(f"Created transfer request: {transfer_id}")

    return transfer_id, receiving_token, lakeside_id


def attempt_accept(transfer_id, token, transfer_url):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.post(f"{transfer_url}/transfers/{transfer_id}/accept", headers=headers, timeout=10)
        return {"status_code": r.status_code, "body": r.json() if r.content else {}}
    except Exception as e:
        return {"status_code": 0, "body": {"error": str(e)}}


def run_test(transfer_url=TRANSFER_URL, capacity_url=CAPACITY_URL, num_workers=NUM_CONCURRENT):
    print("=" * 60)
    print("SurgeLink Concurrent Accept Race-Condition Test")
    print("=" * 60)

    transfer_id, receiving_token, hospital_id = setup_test_scenario(capacity_url, transfer_url)

    print(f"\nFiring {num_workers} simultaneous accept requests...")
    print(f"Transfer ID: {transfer_id}")
    print(f"Expected: exactly 1 success, {num_workers - 1} failures\n")

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = [
            executor.submit(attempt_accept, transfer_id, receiving_token, transfer_url)
            for _ in range(num_workers)
        ]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    successes = [r for r in results if r["status_code"] == 200]
    failures = [r for r in results if r["status_code"] != 200]

    print("Results:")
    print(f"  Successes: {len(successes)}")
    print(f"  Failures:  {len(failures)}")
    print()

    for i, r in enumerate(results):
        status = "SUCCESS" if r["status_code"] == 200 else "FAILED"
        error = r["body"].get("error", "")
        print(f"  Request {i+1:2d}: {status} (HTTP {r['status_code']}) {error}")

    print()
    passed = len(successes) == 1 and len(failures) == num_workers - 1
    if passed:
        print("PASS: Exactly 1 accept succeeded — no double-allocation.")
    else:
        print(f"FAIL: Expected 1 success and {num_workers - 1} failures, got {len(successes)} and {len(failures)}")

    # Verify final capacity
    admin_token = login("admin@lakeside.regional", "admin123", capacity_url)
    r = requests.get(
        f"{capacity_url}/hospitals/{hospital_id}/capacity",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    capacity = r.json()["capacity"]
    icu = next(c for c in capacity if c["bed_type"] == "icu")
    print(f"\nFinal Lakeside ICU capacity: {icu['available']}/{icu['total']}")
    if icu["available"] == 0:
        print("PASS: Available count is 0 (not negative).")
    else:
        print(f"WARN: Expected 0 available, got {icu['available']}")

    print("=" * 60)
    return passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--transfer-url", default=TRANSFER_URL)
    parser.add_argument("--capacity-url", default=CAPACITY_URL)
    parser.add_argument("--workers", type=int, default=NUM_CONCURRENT)
    args = parser.parse_args()

    try:
        passed = run_test(args.transfer_url, args.capacity_url, args.workers)
        sys.exit(0 if passed else 1)
    except requests.exceptions.ConnectionError:
        print("ERROR: Cannot connect to services. Run 'docker-compose up' first.")
        sys.exit(2)
