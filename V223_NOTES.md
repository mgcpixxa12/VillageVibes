# v223 — Campus discussions and employee ID sign-in

- Discussions have a proper split list/detail layout; completed discussions leave the ongoing list.
- Images are resized to fit 1280x720 and JPEG compressed below 180KB, stored as individual `campusDiscussionImages` Firestore documents (max five per discussion), not in the parent discussion document. Completing a discussion deletes those image documents and clears references. Failed deletes are tracked in `imagesCleanupPending` and `imageIds` for follow-up.
- Employee IDs are numeric strings of 1–24 digits, unique across all users. Leaders must assign IDs in Leadership > Users before switching entirely to employee-ID login. The old roster login is temporarily available for migration.
- Family Members is a distinct Users card, but family account creation/authentication is intentionally not enabled.
- This build does not change Firebase security rules. Browser/Firebase testing is needed.
