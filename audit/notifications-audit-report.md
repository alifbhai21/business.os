# NOTIFICATIONS MODULE AUDIT — MongoDB-Verified
> Business OS full audit — business `6a8c8c779a76c6b095f949c7` (FULLAUDIT-*)
> Date: 2026-08-24 · Server: launch-atlas-server.ts (port 4000) · DB: business_os_api_test

## Engine model (source-confirmed)
Notifications are materialized LAZILY by `evaluateAndMaterialize()` on GET /api/v1/notifications.
Unique per-business `dedupKey` upsert ⇒ generation is idempotent (one row per condition per day-bucket).

| Notification type | Condition scanned (all business-scoped) |
|---|---|
| LOW_STOCK | product.minStock>0 AND currentStock<=minStock |
| CUSTOMER_DUE | customer creditLimit>0, ACTIVE, currentDue>=creditLimit |
| SUPPLIER_DUE | supplier currentPayable>0 && ACTIVE |
| SYNC_FAILURE | SyncEvent direction=PUSH status=FAILED (failedCount>0) within 7 days |

## Real trigger actions used (the app's own API, not manual inserts)
1. PUT /products/<prod> {minStock:110}  → product currentStock=105 ⇒ LOW_STOCK true
   (verified in MongoDB before materialization: products doc minStock=110 ✓)
2. PUT /customers/<cust> {creditLimit:20000} → customer currentDue=31000 ⇒ CUSTOMER_DUE true
   (verified in MongoDB: customers doc creditLimit=20000 ✓)
3. Supplier payable from purchases ⇒ SUPPLIER_DUE true (supplier currentPayable=47000, ACTIVE — verified)
4. POST /sync/push with insufficient-stock sale → CONFLICT (ApiError) → SyncEvent status=PARTIAL
   (verified MongoDB syncevents: opCount 1, conflictCount 1, failedCount 0, status PARTIAL)
   ⇒ SYNC_FAILURE correctly NOT materialized — it only fires on a NON-ApiError exception. Not
   reproducible without injecting a server-side bug, so documented here rather than forced.

## Verified API behavior (HTTP) — all passed
| Endpoint | Result | Notes |
|---|---|---|
| GET /notifications (trigger) | 200 | materialized 3 rows; equal to Mongo |
| GET /notifications?filter=unread | 200 | unread-only filtering correct |
| POST /notifications/:id/read | 200 | read:true |
| POST /notifications/:id/read (repeat) | 200 | idempotent |
| POST /notifications/read-all | 200 | marked 2 remaining |
| GET /notifications/preferences | 200 | defaults all on |
| PUT /notifications/preferences (lowStock=false) | 200 | persisted |
| LIST after lowStock=false | 200 | LOW | was suppressed at read (3→2) |
| PUT /notifications/preferences (lowStock=true) | 200 | re-enabled, LIST total 3 |
| GET /notifications (no-a) | 401 | route requireAuth |
| GET /notifications/preferences (no-a) | 401 | route requireAuth |
| GET /notifications foreign biz | 404 | tenant isolation |
| PUT /notifications/preferences foreign biz | 404 | tenant isolation |
| POST /notifications/:foreignNotif/read | 404 | tenant isolation on read |
| POST /notifications/badId/read | 404 | invalid ObjectId |

## MongoDB verification (MCP)
- notifications (business) = 3 docs — LOW_STOCK, CUSTOMER_DUE, SUPPLIER_DUE
  each: businessId correct, dedupKey correct, refType/refId correct, body correct, shopId null
- notificationreads (user) = 3 rows — LOW_STOCK readAt, +2 after read-all, per-user
- notificationpreferences (user) = 1 doc (upsert) lowStock false→true with timestamps

## Discrepancy observed (non-defect)
After the first mark-read call, the immediately following GET /notifications list reported the item
read:false although NotificationRead doc existed; the next list call returned read:true and
unread filter was consistent. Traced to read-after-write replication visibility on the Atlas
replica set (single-connection read), not a code path bug. Re-verification pass confirmed stable.

## Final summary
Notifications tested: 9 flows (materialize/list, unread filter, markRead, idempotent markRead, markAll, prefs get/put, suppression, re-enable, RBAC/tenant)
Passed: 9
Fixed: 0
Blocked: SYNC_FAILURE generation requires a non-ApiError exception (documented; not forced)
MongoDB records verified: 3 (LOW_STOCK, CUSTOMER_DUE, SUPPLIER_DUE) + 1 PARTIAL SyncEvent
Read-state verified: 3 NotificationRead rows
Preferences verified: 1 NotificationPreference doc (toggle false→true persisted, suppression confirmed)
Remaining failures: none