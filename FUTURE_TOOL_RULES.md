# Village Vibes Future Tool Rules

## Location separation is required everywhere
- Every location-scoped record should store `schoolId` and/or `schoolIds` at creation time.
- Every list view must filter records through the logged-in user's assigned `schoolIds` unless the user is System Admin or has deliberately been assigned to multiple locations.
- Leaders and DOSO users should only see people, tasks, requests, notifications, and reports for their assigned location(s).
- If someone needs cross-location visibility, assign that user to multiple school locations instead of bypassing filters.
- Assignment pickers should only show users in the current user's location scope.

## Permission pattern for future tools
- Separate permissions for submit, assigned-to-me, read-only all, and manage actions when those are meaningfully different.
- Read-only permissions must not render edit controls, status controls, assignment controls, delete buttons, or save buttons.
- Management permissions can include status changes, notes, assignment, completion, and admin actions.

## Modal safety
- Request/create forms shown in popups should not close from accidental outside clicks.
- Close only on explicit Cancel/Close buttons or successful submit.
- Preserve form progress whenever possible.

## Campus Cares / Notification rules added in v74
- New Campus Cares tasks must start with a blank status. Status should only change after a user intentionally changes it.
- Teachers should see status updates directly on their submitted tasks. Do not show hidden leader-note placeholders or text like “Leader notes are only visible...” to teachers.
- Assignment UI should stay compact in task tables. Use a button/modal checklist rather than rendering all names directly in the row.
- Notes should behave like a chat thread: newest first, `MM/DD HH:MM am/pm` stamps, current user's notes shifted right, other users shifted left.
- Notification options must be user-selectable, but only from notification types the user's role/position is permitted to use in System Admin. Do not allow teachers to subscribe to schoolwide/all-task notifications unless explicitly granted.
