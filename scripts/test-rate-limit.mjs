#!/usr/bin/env node
/**
 * Fire 6 requests rapidly; the 6th should return 429 Too Many Requests.
 * Usage: node scripts/test-rate-limit.mjs [base_url]
 * Example: node scripts/test-rate-limit.mjs http://localhost:3000
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/chat/stream?prompt=hi`;

async function main() {
  console.log(`Sending 6 requests to ${ENDPOINT}...\n`);

  for (let i = 1; i <= 6; i++) {
    try {
      const res = await fetch(ENDPOINT);
      console.log(`Request ${i}: HTTP ${res.status}`);
      if (i === 6) {
        if (res.status === 429) {
          console.log("  OK: 6th request correctly returned 429 Too Many Requests");
        } else {
          console.log(`  FAIL: Expected 429, got ${res.status}`);
          process.exit(1);
        }
      }
    } catch (err) {
      console.log(`Request ${i}: Error - ${err.message}`);
      if (i === 6) process.exit(1);
    }
  }

  console.log("\nRate limit test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
