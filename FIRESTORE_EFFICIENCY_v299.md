# v299 — conservative Firestore efficiency patch

Base: v298 Links Delete. Existing Firestore rules and data schema are unchanged. Only app.js and index.html changed, plus this note.

## Changes
- Restored sessions no longer fetch the landing roster before loading the signed-in workspace. Session startup retains directory, roles, positions, calendar, themes, certificates, branding and tool settings. Operational data is loaded when opening the relevant tool or administrative panel.
- Money Requests no longer reads Campus Cares collections. Printables and Core Champion use their own loaders. Notification and shortcut navigation explicitly loads deferred data where needed.
- Notification startup uses the existing live listener rather than a second full collection read. Explicit post-write refreshes remain. All existing role, position, campus and direct recipient matching is retained; the listener is still collection-wide to avoid losing legacy notifications.
- Known single-collection administrative edits refresh their own data and invalidate the full admin navigation cache. Broad admin panel refreshes remain for compatibility.
- Weekly Themes does not fetch OLE inventory and feedback until a relevant tab opens. Existing forced refreshes after writes remain.
- Links and Huddle listeners stop when leaving their workspace; notification and weather listeners stop on logout.
- Console diagnostic: run `vvReadReport()` to see successful explicit SDK calls and returned document counts since page load. It does not include listener reads, Links' separately imported SDK, index reads, security-rule reads, failed requests, minimum query charges or distinguish server/cache results. Not a billing meter.

## Deployment and verification
Deploy the full ZIP as usual. No rules changes or indexes are required by this patch. Confirm the console version is v299-firestore-efficiency. Keep v298 available for rollback.

Test with existing leadership accounts: fresh login and persisted session, role preview, both campuses, Huddle messaging and task assignment, Forms publishing and responses, Events, Money Requests approval and budget balances, Campus Cares, Printables, Links sharing and receiving, notification open/clear, shortcuts, Curriculum tabs and edits, logout and login as another user. Compare the same scripted session in v298 and v299 using Firebase usage over comparable intervals; avoid browsing the database during measurements. No live Firebase or browser integration test was performed in this environment.

Remaining opportunities: server-side notification targeting with legacy compatibility, campus-scoped operational queries, on-demand Forms responses, per-panel admin loaders. These require further integration tests before rollout. No quantified savings are claimed.
