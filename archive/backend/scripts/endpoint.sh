#!/bin/bash
BASE_URL="http://localhost:8000"

echo "=== GET /dashboard (Latest) ==="
curl -s "$BASE_URL/dashboard" | python3 -m json.tool

echo ""
echo "=== GET /dashboard/history (Last 6 hours, raw, limit 100) ==="
START=$(date -u '+%Y-%m-%dT%H:%M:%S' -d '6 hours ago')
END=$(date -u '+%Y-%m-%dT%H:%M:%S')
curl -s "$BASE_URL/dashboard/history?start=$START&end=$END&limit=100&resolution=raw" | python3 -m json.tool

echo ""
echo "=== GET /dashboard/history (Full day, hourly resolution) ==="
TODAY=$(date -u '+%Y-%m-%d')
curl -s "$BASE_URL/dashboard/history?start=${TODAY}T00:00:00&end=${TODAY}T23:59:59&limit=500&resolution=hour" | python3 -m json.tool

echo ""
echo "=== GET /dashboard/history (Exceed limit - expect 422) ==="
curl -s "$BASE_URL/dashboard/history?start=${TODAY}T00:00:00&end=${TODAY}T23:59:59&limit=9999&resolution=raw" | python3 -m json.tool