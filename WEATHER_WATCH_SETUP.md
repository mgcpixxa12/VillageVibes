# Weather Watch — v291 (manual-only)

## What's included
- Campus-wide Green / Yellow / Red outdoor-play code visible to staff assigned to the campus.
- Leaders/owners can change the code, must enter a reason, and can request a fresh National Weather Service observation with **Refresh weather now**.
- Separate timestamps for last successful weather refresh, station observation time, and last code change.
- A stale-data warning when the latest successful weather refresh is over 30 minutes old.
- School-specific Firestore document at `campusWeather/{schoolId}`. No periodic weather requests and no scheduled functions.
- Disabled **Enable automatic updates** setting as a placeholder for future work.

## Deployment
1. Deploy the updated website files to your GitHub Pages hosting as usual.
2. **Deploy the updated `firestore.rules` to the existing Firebase project.** The new `campusWeather` collection will otherwise be blocked by Firestore permissions. Merge rules carefully if production rules have changed.
3. In Village Vibes, open **Weather Watch** as a leader, choose your campus, and expand **Weather station location setup**. Enter latitude and longitude for each campus and save.
4. Click **Refresh weather now**. The browser requests NWS station data, then saves the reading and timestamp to Firestore.
5. Assess the official NC Child Care Weather Watch chart plus air quality, rain, lightning and site conditions. Select Green / Yellow / Red, enter a reason, and click **Save campus code**.

## Important limitations
- **No automatic color-code calculation in v291.** The NWS weather refresh updates observations only. A leader sets the campus code manually. This avoids presenting unverified threshold logic as North Carolina-compliant.
- The NWS public API needs no API key. Browser-side NWS requests may be subject to cross-origin or service restrictions; if so, a future HTTPS Firebase function can proxy requests. The app shows a refresh error and preserves the previous timestamp if the request fails.
- The closest available NWS station may not exactly reflect conditions on the playground. A recent refresh timestamp is not proof that the underlying observation is fresh: the observation time is shown separately.
- Firestore reads are driven by live document listeners while the Weather Watch tool is open. There are no scheduled writes.
- The auto-update switch is intentionally disabled; implementing it later will require scheduled Cloud Functions and official threshold verification.
- No coordinates are shipped by default; enter the campus-specific values in the leader controls.


## v293 compact weather header
- Status, temperature, last successful refresh time, and refresh icon appear inline next to the page title.
- The ellipsis opens the full weather settings for campus coordinates and manual overrides.
- A leader's refresh fetches NWS observations and assigns a *temperature-only guidance* color using conservative bands: red at <=15°F or >=105°F, yellow at <=32°F or >=90°F, otherwise green. These are preliminary guidance bands, **not a digitization of the complete official color chart**.
- The displayed guidance does NOT evaluate air quality, precipitation, severe weather, or on-site hazards. Leaders must check those before outdoor play.
- Automatic scheduled updates remain OFF. The page reads stored status from Firebase; it does not call NWS on page load.
- Set campus latitude/longitude in Weather details before the first refresh.
