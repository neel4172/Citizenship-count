# Canada Citizenship Day Tracker — starter PWA

## Publish free with GitHub Pages
1. Open the public repository `neel4172/Citizenship-count`.
2. Upload `index.html`, `app.js`, `manifest.webmanifest`, `sw.js`, and `icon.svg` to the repository root (not a nested folder).
3. Open repository **Settings → Pages → Build and deployment**. Select **Deploy from a branch**, branch **main**, folder **/(root)**, and Save.
4. Wait for the published URL: `https://neel4172.github.io/Citizenship-count/`.
5. Open that URL in iPhone Safari. Tap **Share → Add to Home Screen → Add**.

## Current limitations
- This starter computes PR days only, in a rolling 5-year window. It excludes eligible pre-PR credit, unusual IRCC exceptions, and other citizenship conditions.
- Enter complete travel history. Overlapping trips are flagged. Departure and return days are not deducted as full absence days.
- It is an independent planning estimate, not an official IRCC assessment.
- Data stays in localStorage on each device. Use Export backup to retain a copy. No account sync.
- The app uses a simple SVG icon; iOS home-screen icon appearance can vary.

## Important
Compare calculations with IRCC's official physical presence calculator before relying on them: https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/adult-minor/how/physical-presence.html
