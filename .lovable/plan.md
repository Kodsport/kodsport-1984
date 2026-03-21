

## Problem

The admin dashboard query filters competitors to those seen in the last 24 hours (`last_seen >= 24h ago`). All 48 competitors have older `last_seen` timestamps, so the list is empty.

## Solution

Extend the time window or make it configurable. Two options:

### Option A (Recommended): Show all competitors, remove the time filter
Remove the `.gte('last_seen', oneDayAgo)` filter entirely so admins always see all competitors. The status column already indicates online/offline/inactive.

### Option B: Add a time filter dropdown
Add a UI control letting admins choose the time range (1h, 24h, 7d, All).

## Changes (Option A)

**File: `src/components/AdminDashboard.tsx`**
- Remove lines 43 and 48 (the `oneDayAgo` variable and the `.gte('last_seen', oneDayAgo)` filter)
- This will show all competitors regardless of when they were last seen

This is a 2-line change in a single file.

