# Database authorization matrix

## Purpose

Define the intended database access boundary for the canonical Phase 2 tables. This is a design and test contract, not a grant list or an implementation of PostgreSQL policies. Read it with [RLS design](rls-design.md), [retention and deletion](retention-deletion.md), [authentication and authorization](../architecture/authentication-authorization.md), and [ADR-006](../decisions/ADR-006-authentication-authorization.md).

## Security model and assumptions

- Supabase Auth authenticates a session. Application use cases make business authorization decisions from current trusted database state. RLS is a separate defense-in-depth control.
- Deny is the default. An omitted actor or operation is denied.
- Public reads and conversion actions go through server use cases. Anonymous users receive no direct table-write grant, including for lead, appointment, upload, or analytics ingestion.
- Data API grants and RLS are separate controls. A row allowed by RLS is still unavailable without the corresponding schema/table/operation grant; a grant never bypasses RLS.
- `user_metadata`, browser state, hidden fields, route visibility, and user-supplied identifiers are never authorization sources. Application/JWT claims can be stale and are not authoritative for sensitive commands.
- The privileged service identity is server-only, tightly scoped by use case or worker, and monitored. It is not a general application bypass.
- No speculative `organization_id` or tenant scope is assumed. The initial system serves one operating business under [ADR-009](../decisions/ADR-009-future-multi-tenancy-boundary.md).

## Actor and notation legend

Actors are exactly: **anonymous** (`AN`), **authenticated customer** (`CU`), **advisor** (`AD`), **admin** (`AM`), and **privileged service** (`PS`).

- `public server` means an anonymous or customer-facing server query exposes only an approved public projection; it is not direct Data API table access.
- `conversion server` means an abuse-protected, validated, idempotent application command accepts user intent; it does not grant the caller table mutation rights.
- `own` means the row is related to the authenticated customer through trusted database state, never a submitted owner identifier.
- `scoped` means the advisor's current object permission/assignment is loaded from trusted state. The exact staff role/permission matrix remains an **Open Decision**.
- `all` still means only the rows and fields required for the named administrative use case, with sensitive actions audited.
- `PS` access is limited to the named worker/use case. Service credentials are not used for ordinary browser-backed CRUD.
- `—` means denied. `soft-delete` is an explicit command that changes lifecycle state; it is not an unrestricted update. `hard purge` is a separate privileged retention/privacy command.

## Canonical 44-table operation matrix

Each cell states the actors and conditions intended for that operation. `D/SD` means physical delete or soft-delete intention, explicitly identified per row.

| # | Table | SELECT | INSERT | UPDATE | D/SD | Special command intention |
|---:|---|---|---|---|---|---|
| 1 | `user_identities` | CU/AD own; AM all; PS identity tasks | PS provisioning/linking only | CU/AD limited self-service fields through server; AM/PS status/link maintenance | Soft-delete/disable: AM or PS offboarding only | Link/unlink provider identity, disable, restore, and session-revocation coordination are audited server commands. |
| 2 | `advisors` | Public server exposes publishable profile; AD own; AM all; PS narrow | AM/PS provisioning | AD own permitted profile fields; AM all; PS sync | Soft-delete: AM offboarding | Restore/reassign/offboard require current grant checks and audit. |
| 3 | `roles` | AD/AM for authorized administration/effective-access inspection; PS | AM/PS | AM/PS | Soft-delete/deactivate: AM/PS | Exact role definitions and separation of duties remain Open Decision. |
| 4 | `permissions` | AD/AM for effective-access inspection; PS | AM/PS | AM/PS | Soft-delete/deprecate: AM/PS | Permission keys are controlled vocabulary, never user-created claims. |
| 5 | `role_permissions` | AD/AM for effective-access inspection; PS | AM/PS | AM/PS | Physical detach: AM/PS | Grant/revoke permission is audited and invalidates stale authorization context. |
| 6 | `user_role_assignments` | AD own effective assignments; AM all; PS | AM/PS | AM/PS | No soft delete; end/revoke: AM/PS; retention purge PS | Assign, revoke, expire/end, and regrant are audited; ended grants are not restored and self-escalation is impossible. |
| 7 | `listing_types` | Public server; CU/AD/AM; PS | AM/PS catalog management | AM/PS | Soft-delete/deactivate: AM/PS | Publish/deactivate vocabulary through controlled catalog command. |
| 8 | `property_types` | Public server; CU/AD/AM; PS | AM/PS catalog management | AM/PS | Soft-delete/deactivate: AM/PS | Same controlled-vocabulary boundary as listing types. |
| 9 | `properties` | Public server published subset; CU public subset; AD scoped; AM all; PS narrow | AD scoped; AM | AD scoped; AM; PS only named automation | Soft-delete: AD with explicit permission or AM; hard purge PS only | Publish, unpublish, restore, price/state changes, assignment, and privacy takedown are explicit audited commands. |
| 10 | `property_state_history` | AD scoped; AM; PS; public facts only through parent read model | PS/application transaction only | — | —; retention purge PS only when policy permits | Append-only evidence generated with the authoritative property transition. |
| 11 | `property_slug_history` | Public server for redirect resolution; AD scoped; AM; PS | PS/application transaction only | — | —; exceptional purge PS only | Append-only slug change; redirect/collision validation is a server command. |
| 12 | `locations` | Public server approved subset; CU/AD/AM; PS | AM/PS location management | AM/PS | Soft-delete: AM/PS | Rename/reparent/restore require hierarchy, slug, SEO, and child checks. |
| 13 | `property_features` | Public server approved subset; CU/AD/AM; PS | AM/PS catalog management | AM/PS | Soft-delete/deactivate: AM/PS | Controlled vocabulary; deactivation must not silently rewrite property history. |
| 14 | `property_feature_assignments` | Public server for published parents; AD scoped; AM; PS | AD scoped; AM | AD scoped; AM | Physical detach: AD scoped or AM | Assign/detach occurs through property edit with current-state and feature-status checks. |
| 15 | `property_advisor_assignments` | Public server exposes only approved advisor attribution; AD scoped/own; AM; PS | AM or AD with explicit assignment permission | AM or AD with explicit assignment permission | No soft delete; end/unassign with same explicit permission; retention purge PS | Assign, transfer, and end are audited; ended assignments are not restored and self-assignment is not implied by advisor status. |
| 16 | `property_price_history` | AD scoped; AM; PS; public current/approved history only through read model | PS/application transaction only | — | —; retention purge PS only | Append-only price fact written atomically with authorized price change. |
| 17 | `media_upload_sessions` | AD initiating/scoped; AM; PS | AD scoped or AM through upload-initiation use case | AD initiating/scoped, AM, or PS lifecycle worker | No soft delete; abort/expire through lifecycle; retention purge PS | Issue/finalize/abort/expire are bounded idempotent commands; no browser general storage authority. |
| 18 | `property_media` | Public server ready-and-eligible subset; AD scoped; AM; PS | AD scoped or AM through upload workflow | AD scoped; AM; PS lifecycle worker | Soft-delete: AD scoped or AM; hard purge PS | Reorder, cover selection, visibility, replacement, restore, reprocess, and takedown are explicit commands. |
| 19 | `property_media_variants` | Public server ready-and-eligible subset; AD scoped; AM; PS | PS media processor only | PS media processor/reconciliation only | Physical purge: PS after lifecycle checks | Generate/publish eligibility is never set from browser input; immutable variant replacement creates a new version. |
| 20 | `media_processing_attempts` | AD scoped safe status; AM; PS | PS processor only | PS claim/outcome fields only | Retention purge: PS only | Claim, heartbeat, retry, fail, and resolve are privileged worker/admin commands with bounded attempts. |
| 21 | `leads` | AD scoped; AM; PS narrow | AN/CU only via conversion server; AD/AM internal capture; PS import | AD scoped; AM; PS named ingestion/reconciliation | Soft-delete: AD with explicit permission or AM; hard purge PS | Assign, qualify, reject, convert, merge/link, export, restore, and erase are audited commands. |
| 22 | `lead_conversions` | AD scoped; AM; PS | PS/application conversion transaction only | — | —; retention/privacy purge PS only | Append-only conversion/link evidence; conversion never mutates history in place. |
| 23 | `customers` | CU own only if customer accounts are approved; AD scoped; AM; PS narrow | AD/AM or conversion server; PS import | CU limited own fields only if approved; AD scoped; AM; PS reconciliation | Soft-delete: CU erasure request triggers server workflow, AD explicit permission, or AM; purge PS | Merge, export, restore, restrict processing, and erase require purpose and audit checks. |
| 24 | `customer_contact_points` | CU own if accounts approved; AD scoped; AM; PS narrow | CU own via server if approved; AD scoped; AM | Same as insert with verification/primary-contact rules | Soft-delete: same scope; purge PS | Verify, set primary, suppress, restore, and erase are explicit commands; contact PII is never public. |
| 25 | `customer_merge_history` | AM and specially permitted AD; PS | PS/application merge transaction only | — | —; legal/privacy purge PS only | Append-only merge evidence; merge and reversal, if allowed, are audited high-impact commands. |
| 26 | `customer_requests` | CU own if accounts approved; AD scoped; AM; PS narrow | CU via authenticated server if approved; AD scoped; AM | CU limited own requirements if approved; AD scoped; AM | Soft-delete/close: CU own if approved, AD scoped, or AM; purge PS | Activate, pause, close, restore, reassign, and export are authorized commands. |
| 27 | `customer_request_features` | CU own if accounts approved; AD scoped; AM; PS | CU/AD/AM only through parent request command | CU/AD/AM only through parent request command | Physical detach through parent request command | Assignment validates active parent/feature and cannot bypass request ownership. |
| 28 | `customer_activities` | CU own safe subset only if approved; AD scoped; AM; PS | AD scoped, AM, or PS/application event capture | —; PS exceptional policy-governed privacy redaction only | No soft delete; retention/privacy purge PS only | Append correction/activity rather than rewriting facts. Exceptional redact, export, erase, and purge are audited with PII minimization. |
| 29 | `appointments` | CU own if accounts approved or via guarded lookup; AD participant/scoped; AM; PS narrow | AN/CU only via conversion server; AD scoped; AM | CU limited reschedule/cancel through server; AD participant/scoped; AM | Soft-delete/cancel: CU/AD within rule or AM; purge PS | Request, confirm, reschedule, cancel, complete, no-show, restore, and conflict handling are state commands. |
| 30 | `property_customer_matches` | CU own approved results if accounts approved; AD scoped; AM; PS | AD scoped, AM, or PS matcher | AD scoped, AM, or PS matcher | Soft-delete/dismiss: CU own if approved, AD scoped, AM, or PS | Generate, review, accept/dismiss, restore, and expire require current property/request eligibility. |
| 31 | `property_customer_match_reasons` | CU own safe reasons if approved; AD scoped; AM; PS | PS matcher or AD/AM review command | AD scoped, AM, or PS recomputation | Physical delete/rebuild: PS or authorized review command | Reasons expose no internal/private property or customer facts to customers. |
| 32 | `seo_pages` | Public server published/indexable subset; AD with content permission; AM; PS | AD with content permission; AM | Same as insert | Soft-delete: same permission; purge PS | Draft, approve, publish, unpublish, restore, and indexability changes are explicit audited commands. |
| 33 | `seo_page_query_definitions` | Public server only through approved page read model; AD with content permission; AM; PS | AD with content permission; AM | Same as insert | Soft-delete: same permission; purge PS | Validate, approve, activate, replace, and restore bounded curated queries; never arbitrary filter promotion. |
| 34 | `seo_page_features` | Public server through published parent; AD with content permission; AM; PS | AD with content permission; AM | Same as insert | Physical detach: same permission | Attach/detach through SEO page edit and active-feature checks. |
| 35 | `seo_page_slug_history` | Public server for redirect resolution; AD with content permission; AM; PS | PS/application transaction only | — | —; exceptional purge PS only | Append-only slug history with collision and redirect-loop checks. |
| 36 | `content_entries` | Public server published subset; AD with content permission; AM; PS | AD with content permission; AM | Same as insert | Soft-delete: same permission; purge PS | Draft, review, publish, unpublish, restore, and takedown are audited commands. |
| 37 | `content_slug_history` | Public server for redirect resolution; AD with content permission; AM; PS | PS/application transaction only | — | —; exceptional purge PS only | Append-only slug history with canonical redirect checks. |
| 38 | `location_slug_history` | Public server for redirect resolution; AD with location permission; AM; PS | PS/application transaction only | — | —; exceptional purge PS only | Append-only history written with authorized location rename. |
| 39 | `public_route_reservations` | Public routes resolve only through publishable server/read models; AM; PS reconciliation | AM only through reviewed slug/route command; PS narrow reconciliation/import | AM only through reviewed route transfer/state command; PS narrow reconciliation | No ordinary delete or soft-delete reuse; exceptional policy purge PS only | Reserve, transfer, redirect, retire-with-reservation, and reconcile global normalized routes; CU/AD have no direct writes. |
| 40 | `analytics_event_definitions` | AD with analytics permission; AM; PS; public clients only receive an allowlisted emission contract | AM/PS | AM/PS | Soft-delete/deprecate: AM/PS | Version/activate/deprecate event schemas; definition changes never alter historical events. |
| 41 | `analytics_events` | AD with analytics permission sees minimized aggregates or purpose-limited rows; AM/PS purpose-limited | AN/CU only via analytics ingestion server; AD/AM server events; PS ingestion | — | Retention/privacy purge: PS only | Append-only, PII-free event acceptance/deduplication; analytics failure never changes business outcome. |
| 42 | `audit_logs` | AM with explicit audit permission; PS incident/compliance task | PS/application transaction only | — | — for normal roles; exceptional policy-governed purge PS only | Append-only. Normal application roles cannot update/delete; access, export, and exceptional retention actions are themselves audited. |
| 43 | `outbox_messages` | PS dispatcher/operations only; AM only through purpose-built safe operational view | PS/application transaction only | PS claim/attempt/outcome fields only | Privileged retention purge: PS only | Claim, lease, retry, resolve, replay, and purge are privileged and audited; payloads contain no secrets/raw PII. |
| 44 | `site_settings` | Public server safe allowlist; AD with settings permission; AM; PS | AM/PS | AM/PS | Soft-delete/version retirement only if modeled: AM/PS | Change, activate, rollback, and secret-bearing setting access are explicit commands; secrets do not belong in this table. |

## Actor summaries

- **Anonymous:** receives only approved public projections and submits conversion/telemetry intent through server commands. No direct table writes and no access to draft, deleted, identity, permission, CRM, audit, or outbox rows.
- **Authenticated customer:** has no additional access unless a customer-account feature is approved. If approved, access is limited to trusted own relationships and constrained server commands; public behavior remains server-mediated.
- **Advisor:** receives current, object-scoped operational access only through explicit permissions. Advisor status does not imply assignment, export, delete, restore, publication, customer, or audit authority.
- **Admin:** may perform broad operational use cases, but still requires current explicit permissions, field-level restrictions, audit, lifecycle checks, and RLS. `admin` is not synonymous with unrestricted service role.
- **Privileged service:** performs narrowly named provisioning, transaction, worker, reconciliation, retention, or incident tasks. Credentials are isolated by environment and purpose, and unexpected use is alerted.

## Access-matrix verification requirements

Before exposing any table or view, automated tests must derive cases from every matrix row and operation:

1. prove default denial for all five actors and each unlisted operation;
2. prove positive and negative row cases for public/published, own/not-own, advisor scoped/unscoped, admin permitted/unpermitted, active/deleted, and current/stale grant states;
3. prove `UPDATE` requires visibility of the existing row and separately validates the resulting row state;
4. prove anonymous and customer conversion flows cannot write tables directly and cannot set ownership, role, publication, lifecycle, audit, or processing fields;
5. prove application denial and RLS denial both fail closed, including direct Data API attempts and privileged-adapter misuse tests;
6. prove grants are no broader than the matching RLS operation and that exposed views use security-invoker semantics or remain unexposed;
7. prove append-only audit/history/analytics rules, outbox privilege isolation, deleted-row invisibility, and cross-object identifier attacks;
8. rerun the suite on every grant, policy, view, relationship, soft-delete, role, or claim change.

## Open Decisions

- Exact staff roles, permission bundles, object scopes, separation of duties, and which advisor actions need approval remain unresolved; this matrix expresses minimum intent, not the final staff role matrix.
- Whether authenticated customer accounts ship in the initial release, and how an Auth identity links to `customers` without enumeration or mistaken merge.
- Which high-impact actions require MFA, recent authentication, dual control, or a second approver.
- Whether any tables are exposed through the Supabase Data API at all versus accessed only by server repositories and security-invoker views.
- Field-level redaction, safe admin projections, export permissions, and support/incident-access workflows.
- Exact retention periods and whether selected history records require exceptional erasure; see [retention and deletion](retention-deletion.md).
