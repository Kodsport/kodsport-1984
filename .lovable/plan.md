

## Bulk Download Recordings by User Selection

### Overview
Add a new "Bulk Download" feature to the Admin Dashboard that lets admins select multiple users via checkboxes and download all their stored recording segments as individual files.

### New Component: `BulkDownloader.tsx`
A modal/dialog component that:
1. Lists all unique users (from competitors table, deduplicated by `user_id` + `name`)
2. Provides checkboxes for multi-select, plus a "Select All" toggle
3. Shows a "Download" button that fetches all recordings for selected users and triggers batch downloads
4. Displays progress during download (fetching signed URLs, downloading segments)

### Flow
1. Admin clicks a new "Bulk Download" button in the AdminDashboard toolbar area (next to Rooms/Notifications buttons)
2. Modal opens showing all users with names and segment counts
3. Admin checks desired users, clicks "Download All"
4. System queries `competitors` for all competitor IDs of selected user_ids, then queries `screenshots` for all recordings of those competitors
5. For each recording, creates a signed URL, fetches the blob, and triggers a download named `{name}-{date-time}-segment-{n}.webm`
6. Downloads are staggered with 100ms delays to avoid browser blocking

### Changes

**New file: `src/components/BulkDownloader.tsx`**
- Props: `onClose: () => void`
- Fetches distinct users from `competitors` table (admin RLS allows full read)
- For each user, fetches count from `screenshots` via competitor IDs
- Checkbox list UI with select all, search/filter by name
- Download button that:
  - Queries all `screenshots` rows for selected users' competitor IDs
  - Creates signed URLs in batches
  - Fetches blobs and triggers downloads with 100ms stagger
  - Shows progress bar (X of Y segments downloaded)

**Modified: `src/components/AdminDashboard.tsx`**
- Import `BulkDownloader`
- Add state `showBulkDownload`
- Add "Bulk Download" button with `Download` icon in the toolbar row (near Rooms/Notifications)
- Render `<BulkDownloader />` modal when `showBulkDownload` is true

### Technical Notes
- Reuses the same download pattern from `RecordingsViewer.downloadAllSegments` (blob fetch → createObjectURL → click link → revoke after 2s)
- Uses existing RLS: admins can read all competitors and screenshots
- Files named: `{competitorName}-{yyyy-MM-dd-HH-mm}-segment-{n}.webm`
- No backend changes needed — all data accessible via existing admin RLS policies

