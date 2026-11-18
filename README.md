# Canada Citizenship Day Tracker

An independent, device-local planning tool for Canadian citizenship physical presence and the standard adult eligibility checklist. It is not affiliated with IRCC and does not determine citizenship eligibility.

The site is published using GitHub Pages: <https://neel4172.github.io/Citizenship-count/>. Changes pushed to the `main` branch are deployed by GitHub Pages. On an existing installed web app, close and reopen it or refresh after an update. The ZIP archive already in the repository is an earlier snapshot; the site uses the current files in the repository root.

## What it does

- Keeps separate named profiles on the current device. Existing single-person saved data is migrated to a profile without deleting the original.
- Calculates the five-year eligibility window before the chosen application date, excluding the application date itself.
- Counts qualifying days in Canada as a PR at one day each, and qualifying pre-PR temporary-resident or protected-person days at half a day each, capped at 365 credited days.
- Combines multiple status periods without counting overlapping days twice, and only counts pre-PR status days before the PR effective date.
- Subtracts full days outside Canada while normally counting departure and return days. An optional exclusion section lets the user enter periods that IRCC says should not count.
- Shows an estimated date for reaching the physical-presence target, recalculating the rolling window and assuming no future travel except trips already entered.
- Provides a self-reported checklist of the standard adult PR, filing, language, prohibitions, test and oath requirements. It does not decide eligibility or determine whether a waiver applies.
- Exports or imports JSON backups of profiles. Imported profiles are added; existing profiles are not replaced. Data is local to each browser/device and is not automatically synced.

## Important limitations

- Enter only eligible authorized status periods and complete travel history. In particular, a permit issued while a refugee claim or PRRA is being assessed does not by itself confer eligible temporary resident status. Protected-person time starts after approval.
- This tool does not determine legal status, judge whether a sentence exclusion applies, calculate special Crown-servant time outside Canada, handle all waivers or assess every citizenship pathway. Minors have separate requirements. Check uncertain situations with IRCC or a qualified professional.
- A forecast is a planning estimate. IRCC encourages a margin above 1,095 days and requires an official calculation for the relevant application process.
- An immigration or fraud review can suspend processing but is not automatically a prohibition on applying. The app cannot determine the outcome.

## IRCC sources

- [Who can apply](https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/adult-minor/who.html)
- [Calculate physical presence](https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/adult-minor/how/physical-presence.html)
- [Adult application guide](https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/cit0002.html)
- [Situations that may prevent citizenship](https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/become-canadian-citizen/eligibility/situtations-prevent-citizenship.html)

## Testing

Run `node --test tests/*.test.js` with a recent Node.js release. The tests cover the IRCC counting examples, date boundaries, the temporary-resident cap, travel and excluded periods, the rolling forecast, and profile migration.
