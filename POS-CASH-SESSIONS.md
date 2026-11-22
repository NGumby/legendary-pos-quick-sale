# Automatic Mont-Royal register sessions

The GitHub Actions scheduler runs every 15 minutes, evaluates times in `America/Toronto` (DST-aware), and only runs an operation near the scheduled time. It does not need a continuously running server.

| Day | Morning opening (CAD 0 float) | Evening close |
| --- | --- | --- |
| Sunday–Wednesday | 09:45 | 20:00 |
| Thursday–Friday | 09:45 | 23:00 |
| Saturday | 09:45 | 20:00 |

## Setup before enabling scheduled writes

1. On the **production shop**, enable POS Pro at Mont-Royal and get the numeric Shopify location ID and **each POS device ID**. This does not use the development store.
2. Arrange an **offline** Shopify Admin API access token with `read_cash_tracking` and `write_cash_tracking` scopes (do not commit it). The app currently has only direct online access, so `shopify app deploy` by itself does not provide an offline token. Add scopes to the installed app only after authorizing and verifying support.
3. In GitHub repository Settings → Secrets and variables → Actions, set `POS_SHOP_DOMAIN` (production `*.myshopify.com`), `POS_ADMIN_TOKEN`, `POS_LOCATION_ID`, `POS_DEVICE_IDS` (comma-separated), and `POS_STAFF_MEMBER_ID` (authorized staff account).
4. To close sessions, set `POS_VERIFIED_CLOSING_COUNTS_JSON` with actual physically verified per-device counts **for that local date**. Example: `{"123":{"date":"2026-11-22","amount":"73.50"},"456":{"date":"2026-11-22","amount":"0.00"}}`. A missing or stale count blocks closing and marks the GitHub Actions job failed. No guessed cash amounts or synthetic reconciliations are recorded.
5. Manually run the GitHub workflow using `dry_run: true`, check its logs and permissions, then test the open/close mutations on a test location/device before enabling unattended operation. The workflow remains inactive on this feature branch until merged.
6. Monitor Actions failures and reconcile the physical drawer daily. Scheduled GitHub Actions executions can be delayed; a 45-minute window covers typical delay. Shopify's close mutation requires a counted balance and staff member, and may be limited by POS Pro eligibility.

Manual command: `node scripts/pos-cash-sessions.mjs --dry-run --open`. The `--open` and `--close` flags are for local tests only; do not use against production without inspecting the target first.

**Accounting:** The next day's opening float of CAD 0 is not the previous night's physical closing count. If the physical drawer isn't actually emptied, the opening balance will intentionally disagree with physical cash. Do not use a fabricated zero close count to erase discrepancies.

**Deployment:** Merge the branch to `main` after testing. The workflow runs in GitHub Actions, independently of the Shopify POS extension publishing script. Shopify app deployment alone does not install the scheduler.
