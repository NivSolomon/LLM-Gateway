#!/usr/bin/env bash
# Fire 6 requests rapidly; the 6th should return 429 Too Many Requests.
# Usage: ./scripts/test-rate-limit.sh [base_url]
# Example: ./scripts/test-rate-limit.sh http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
ENDPOINT="${BASE_URL}/api/chat/stream"

echo "Sending 6 requests to ${ENDPOINT}?prompt=hi..."
echo ""

for i in 1 2 3 4 5 6; do
  echo "Request $i:"
  HTTP_CODE=$(curl -s -o /tmp/rate-limit-response-"$i".txt -w "%{http_code}" -N "${ENDPOINT}?prompt=hi")
  echo "  HTTP $HTTP_CODE"
  if [ "$i" -eq 6 ]; then
    if [ "$HTTP_CODE" = "429" ]; then
      echo "  OK: 6th request correctly returned 429 Too Many Requests"
    else
      echo "  FAIL: Expected 429, got $HTTP_CODE"
      cat /tmp/rate-limit-response-6.txt
      exit 1
    fi
  fi
  echo ""
done

echo "Rate limit test passed."
