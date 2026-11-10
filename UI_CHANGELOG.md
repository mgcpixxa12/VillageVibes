# UI and code review — v189

## Changes made
- Fixed sidebar My Profile navigation: it now invokes the same profile renderer as the account button.
- Removed a duplicate, unreachable Home action branch.
- Redesigned profile presentation with a responsive identity rail and four readable information sections.
- Moved the new profile-specific styling into `profile.css`, separate from the legacy shared stylesheet.
- Kept all profile edit actions, onboarding indicators, role and school display, authentication, and Firestore writes intact.
- Versioned CSS/JS URLs to reduce stale GitHub Pages cache issues.

## Audit observations / next phases
- `app.js` is a ~600 KB monolith containing Firebase data operations, UI rendering, and event handling. A safe modularization should be incremental and verified with Firebase-backed integration tests; splitting it blindly would risk production features.
- `styles.css` contains multiple generations of overlapping selectors. Extract component-specific styles in subsequent passes and remove old rules only after visual regression testing.
- Firestore authorization and the shared PIN scheme need a separate security review before wider deployment.
- No live Firebase integration tests were run.
