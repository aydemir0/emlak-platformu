# Worker and scheduler operations

## HTTP contract

`POST /api/internal/workers/{worker}` is server-only, `no-store`, and requires `Authorization: Bearer <CRON_SECRET>`. Production refuses to start the contract without a 32+ character secret. Callers may send a canonical UUID in `X-Run-Id`; otherwise the server generates one. Responses contain only operation, run ID, outcome, and bounded aggregate counts. Browser sessions, cookies, payload bodies, PII, provider details, and arbitrary batch values grant no authority.

Allowed names are `lead-outbox`, `appointment-reminders`, `media-processing`, `media-reconciliation`, and `maintenance`. The endpoint has a 60-second runtime cap. Existing workers retain atomic claims, leases, idempotency keys, attempt ceilings, stale-lease recovery, structured run summaries, and provider calls outside transactions.

## Enablement matrix

| Worker                | Suggested initial cadence       | Repository state                                   | Enablement dependency                                                                               |
| --------------------- | ------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| lead outbox           | every minute, one invocation    | fail-closed before claim                           | approved notification and analytics consumers, sender/recipient rules, provider timeout/idempotency |
| appointment reminders | every minute, one invocation    | fail-closed before claim                           | approved notifier and recipient resolution                                                          |
| media processing      | every minute, one bounded claim | wired                                              | R2 identity/CORS, runtime memory/timeout, alert route                                               |
| media reconciliation  | daily dry-run                   | fail-closed endpoint; application defaults dry-run | reviewed prefix, grace period, expected count, explicit `maximumDelete`, operator approval          |
| maintenance           | documented window only          | fail-closed before work                            | named bounded maintenance command and owner                                                         |

The deployment platform, region, concrete cadence, overlap policy, and alert destination are intentionally not selected in code. Configure only after ownership approval. Rotate `CRON_SECRET` through the deployment secret store; never put it in URLs or logs.

## Operation and recovery

Monitor last successful run, duration, claimed/succeeded/retried/dead-lettered/stale-recovered counts, oldest due outbox age, media lease age, and consecutive failures. Stop scheduling by disabling the platform schedule; do not delete pending rows. Re-enable one worker family at a time. Dead-letter replay requires an authenticated admin operation, root-cause resolution, a new correlation ID, and preserved idempotency. Reconciliation deletion is never automatic: review dry-run counts and use a maximum lower than or equal to the inspected page.
