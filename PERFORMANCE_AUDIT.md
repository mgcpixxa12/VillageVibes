# Village Vibes performance audit (v191)

## Confirmed code-level bottlenecks
- `refreshAdminData()` made 20 sequential loader calls, many fetching whole Firestore collections. Latency accumulated on each navigation. Now independent loads use `Promise.all`.
- Leadership, Owners, System Admin and System Admin tab navigation always reloaded all admin data. Now these navigation-only calls reuse a successful load for up to 30 seconds. Mutation paths still force refreshes.
- `withAppLoading()` imposed a minimum 175ms overlay display. Removed this artificial wait.

## Remaining performance work (not safe to change without live profiling)
- Multiple tools fetch whole collections instead of scoped/paginated queries.
- The large single-file app performs full DOM replacement on many interactions.
- Certain tools reload unrelated collections on opening; split their data dependencies and cache appropriately.
- Firestore indexes, network waterfall, CPU long tasks and actual production latency require browser profiling.

## Verification
JavaScript syntax validation performed. Browser and Firebase integration not available in this environment; verify permissions, tool data freshness after edits, and role previews before deploying.
