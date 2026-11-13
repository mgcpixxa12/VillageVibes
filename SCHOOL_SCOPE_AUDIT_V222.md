# Village Vibes — School Scope Audit (v222)

## Implemented in this release
- Centralized normalization of legacy `schoolId` and modern `schoolIds` fields.
- Central school access and active-school guards for Campus Cares request/discussion mutations (status, assignment, notes, solutions, approval, removal, conversion).
- Campus Cares bulk deletion is limited to the selected school, instead of deleting all schools' requests.
- Important Dates created through the leadership form now require and store a school; date listing filters scoped records by selected school. Legacy unscoped dates remain visible to system administrators for review, not silently assigned.
- School matching no longer treats missing school IDs as visible to all non-admin users.
- The school selector is based on assigned schools (system administrators can select any active school).

## Architectural risks still requiring coordinated migration
- **Firestore rules are not school-isolating.** The catch-all rule allows any signed-in user to read/write almost all collections. UI filtering is NOT a security boundary. Do not deploy family accounts or claim school data isolation until rules are redesigned, deployed and tested with role-based emulator tests.
- Legacy records in multiple collections lack `schoolId`. They require an explicit, reviewed mapping. Do not auto-assign ambiguous data.
- Weekly themes use a single global `weeklyThemes/current` document, so their data model is not yet per-school. Changing this requires migrating the existing calendar and updating all readers/writers.
- Shared templates, statuses, roles, user accounts, branding and tool definitions require an explicit decision whether they are organization-wide or school-scoped. Making every configuration school-specific blindly would break shared administrative settings.
- Multiple loaders still fetch entire collections and filter in the browser. After rules are locked down, queries need school constraints and indexes.
- Some feature modules (Village Voice, printable templates, Core Champion, budget codes, certificates, photo tools) need dedicated data-model and permission audits before strict school enforcement.
- Important Dates import path needs school assignment and legacy records need migration before treating the calendar as fully scoped.
- There is no automated Firestore emulator regression suite yet. Test single-school user, dual-school user, school admin, system admin, unassigned legacy records, direct document access, and cross-school edits before rollout.

## Recommended next step
Stage a separate **schema + Firestore security rules migration** with data backups, an explicit global-vs-school collection inventory, reviewed legacy assignments, and emulator tests. Do not activate a deny-by-default ruleset against the current client without first updating every collection query and writer.
