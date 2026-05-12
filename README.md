# Village Vibes Phase 1

This is the Phase 1 starter app for Village Vibes.

## Run locally

Double-click or run:

```bash
python serve.py
```

It will start a local server and open the app in your browser.

## Firebase setup

1. Create/use the Firebase project `villagevibes-a5385`.
2. Enable **Authentication > Email/Password** sign-in provider.
3. Create a Firestore database.
4. Paste the included `firestore.rules` into Firebase Firestore Rules and publish.
5. Open the app locally.
6. Use the **First-time setup** card to create the first system admin.
7. From the admin panel, add schools first, then add users.

## First-time setup behavior

The first setup form creates:

- one Firebase Auth account
- one `/system/bootstrap` marker document
- one `/users/{uid}` document with `roles: ["systemAdmin"]`

The bootstrap marker can only be created once by the Firestore rules.

## Version

`VILLAGE VIBES PHASE 1 VERSION: v2-bootstrap`


## v3-bootstrap-fix notes

- Fixed the first-time setup PIN field so 4 numbers like `2175` pass browser validation.
- Removed the schools composite query that required a Firestore index.
- Roster loading now avoids unnecessary composite indexes by filtering active users in the browser.


## v4-manual-admin notes

- Removed the first-time setup/bootstrap user creation card.
- First system admin should be added manually in Firebase Auth + Firestore.
- Kept the v3 fixes that avoid unnecessary Firestore composite indexes.


## v5-admin-login notes

- Removed the visible first-time setup card.
- Added an Admin / Leader Login button on the landing page.
- Admin/Leader login uses Firebase Auth email/password, then loads the matching `users/{uid}` Firestore profile.


## v6-admin-login-fixed notes

- Fully removed the first-time setup/bootstrap card.
- Added Admin / Leader Login on the landing page.
- First system admin is now manual: create Firebase Auth user, then create matching `users/{uid}` Firestore document.
- Console should show `v6-admin-login-fixed`.


## v7-name-password-login notes

- Admin / Leader Login no longer asks users to type fake emails.
- Click a leader/admin name from the selected school's roster, then enter that user's password.
- The app uses the user's saved `fakeEmail` behind the scenes for Firebase Auth.
- Console should show `v7-name-password-login`.


## v8-dev-button notes

- Added a temporary **Dev Admin** button on the landing page.
- `DEV_MODE = true` in `app.js`.
- Firestore rules in this zip are temporary development rules: `allow read, write: if true`.
- Use these only while building/testing. Before publishing publicly, set `DEV_MODE = false` and replace rules with locked-down production rules.


## v9-admin-users-refresh-fix notes

- Admin Users tab now loads all active users from Firestore.
- Toast auto-clear no longer kicks you back to Home.
- Console should show `v9-admin-users-refresh-fix`.


## v10-edit-buttons notes

- Login roster now displays as simple 3-column name buttons.
- Admin Users tab now displays as simple 3-column name buttons.
- Admin Schools tab now displays as simple 3-column school buttons.
- Added edit modals for schools and users.
- User edit modal includes roles, team position, school assignment, PIN reset, and delete.
- Console should show `v10-edit-buttons`.


## v12-pin-modal-fix notes

- PIN entry is now masked/sensitive while typing.
- Successful login clears the login modal before showing the home screen.
- Console should show `v12-pin-modal-fix`.


## v13-modal-clear-hard-fix notes

- Rebuilt the `loginUser()` flow so successful logins always clear the login modal.
- Added a renderHome failsafe to discard old login/admin login modals.
- Console should show `v13-modal-clear-hard-fix`.


## v14-panels-roles-positions notes

- Split the old Admin area into:
  - Leadership Panel: Users
  - System Admin Panel: Schools, Positions, Roles
- Positions are managed by System Admins and appear as a dropdown in the user editor.
- Roles are managed by System Admins and appear as checkboxes in the user editor.
- Leaders can use the Leadership Panel without seeing System Admin configuration.
- Console should show `v14-panels-roles-positions`.


## v15-positions-house-class notes

- System admins now explicitly have access to the Leadership Panel.
- Positions now use `House / Position Name` plus optional `Class Number`.
- Example: `Infant` + `1` displays as `Infant 1`.
- Example: `DOSO` + blank class number displays as `DOSO`.
- Console should show `v15-positions-house-class`.


## v16-nav-fix notes

- Fixed top navigation so system admins see both Leadership and System Admin.
- Fixed old Admin button routing/getting stuck on Home.
- Dev Admin now routes back into the admin tools correctly.
- Console should show `v16-nav-fix`.


## v17-show-leadership-nav notes

- System admins now see both topbar buttons:
  - Leadership
  - System Admin
- The old single Admin button was removed from the topbar.
- Console should show `v17-show-leadership-nav`.


## v18-role-permissions notes

- Clicking an existing role now opens a permission editor.
- Added the first permission tool: Money Requests.
- Money Requests currently has:
  - Money Request Form
  - Pending Requests
  - Approved Requests
- Each permission can be enabled and can optionally require a specific school position.
- New roles must be saved first, then reopened to assign permissions.
- Console should show `v18-role-permissions`.


## v19-single-role-position notes

- Users now have exactly one role and one position.
- User editor role field is now a dropdown, not checkboxes/comma text.
- User editor position remains a dropdown and is now required.
- User documents store both `role` and `roles: [role]` for backward compatibility.
- Password requirement is based on role: Leader, Owner, Admin, or systemAdmin require password setup.
- Console should show `v19-single-role-position`.


## v20-lead-role-fix notes

- Role key `lead` now counts as a leadership/password role.
- Leadership access now works for `lead`, `leader`, `owner`, `admin`, and `systemAdmin`.
- Password setup gate now also checks `passwordRequired` on the user document.
- Console should show `v20-lead-role-fix`.
