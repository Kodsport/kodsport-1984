

## Problem

The `RecordingsViewer` fetches recordings using a single `competitor_id` (line 104 of RecordingsViewer.tsx). However, each screen capture session creates a new `competitors` row. The `AdminDashboard` only shows the latest session per user (lines 52-63), so when you click "view recordings" for Ayaan, it passes one `competitor_id` — missing recordings from the other two sessions entirely.

## Solution

Modify `RecordingsViewer` to accept a `userId` prop (in addition to or instead of `competitorId`) and fetch recordings across **all** competitor records for that user. This way all 3 sessions (and the ~6 hours of missing footage) will appear.

### Changes

**1. `src/components/RecordingsViewer.tsx`**
- Add `userId` as an optional prop
- When `userId` is provided, first fetch all `competitor_id`s for that user from the `competitors` table, then fetch screenshots using `.in('competitor_id', allCompetitorIds)` instead of `.eq('competitor_id', singleId)`
- Fall back to single `competitor_id` if `userId` is not provided

**2. `src/components/AdminDashboard.tsx`**
- Pass the competitor's `user_id` to `RecordingsViewer` so it can fetch all sessions for that user

This is a minimal change — just broadening the query scope so all sessions appear in the session list.

