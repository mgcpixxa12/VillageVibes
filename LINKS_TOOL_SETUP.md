# Links Tool — v295

Deploy all files from this package to your existing Village Vibes site, including the new `links-tool.js`, updated `app.js`, `styles.css`, and `index.html`.

**Firebase deployment required:** Publish the included `firestore.rules` to the correct Firebase project before using Links. The `staffLinks` collection is new. It is owner-private by default, and shared records are readable by staff at the same campus. Family accounts cannot use the tool. The rules exclude `staffLinks` from the existing broad fallback rule.

**Usage:** Open Links from the home tool grid. Add a named HTTP(S) link, optionally share with your campus. Your saved links appear in My Links. Shared Links shows campus links posted by other staff. The red × on your shared link asks for confirmation before stopping sharing. The + Add action copies a shared link to your personal list, with an editable name. Send Link opens a staff-only recipient selector for the selected campus and creates an in-app notification with Open Link and Add to My Links options.

**Notes:** A user assigned to multiple campuses can switch the shared campus. Personal links follow the account across campuses. Notifications use the existing `notifications` collection. Existing Firebase rules for that collection should be reviewed separately before sensitive information is stored. Links use Firestore realtime listeners, and URL input is restricted to HTTP(S). This version has no scheduled jobs.

**Testing:** Confirm create, copy, open, share, unshare, send, receive, and add flows with two staff accounts in the same campus. Verify that a staff member from another campus cannot read private or cross-campus shared links. Test with deployed Firestore rules; syntax validation alone cannot confirm live Firebase permissions.
