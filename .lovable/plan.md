

## Problem

Ayaan has 4 competitor records, 3 with actual recordings (24, 384, and 24 segments). The `groupIntoSessions` function groups purely by **time gap** (>2 minutes = new session), ignoring `competitor_id` boundaries.

The first session ends at 09:16 and the second starts at 09:17 — only a 1-minute gap. So `groupIntoSessions` merges them into one giant session (408 segments), hiding the fact that these are separate capture sessions. Result: the user sees 2 sessions instead of 3.

## Fix

Update `groupIntoSessions` to also split on `competitor_id` changes. When the `competitor_id` differs between consecutive recordings, treat it as a session boundary regardless of time gap.

### Changes

**`src/components/RecordingsViewer.tsx`** — In the `groupIntoSessions` loop (line 49), add a second condition:

```typescript
if (gap > 2 || sorted[i].competitor_id !== sorted[i - 1].competitor_id) {
```

This single-line change ensures that recordings from different competitor records are never merged, even if they are close in time. The 384-segment session will now appear as its own session.

