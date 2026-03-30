

## Add ZIP Download as Secondary Option

### Overview
Keep the existing individual-file download and add a "Download as ZIP" option alongside it. Use `JSZip` to bundle segments into a single archive organized by user subfolder.

### Changes

**Install dependency**: `jszip`

**Modified: `src/components/BulkDownloader.tsx`**
- Import `JSZip`
- Replace the single download button with two buttons side by side:
  - **"Download Files"** — existing behavior (individual staggered downloads)
  - **"Download ZIP"** — new option that fetches all blobs, adds them to a JSZip instance organized as `{name}/{name}-{date-time}-segment-{n}.webm`, generates the archive, and triggers a single download named `recordings-{timestamp}.zip`
- Both buttons share the same selection/filter logic and disable during any active download
- Progress bar works for both modes; ZIP mode shows "Fetching segment X of Y..." then "Creating ZIP..."

### Technical Notes
- JSZip runs client-side; no backend changes needed
- The existing `handleDownload` becomes `handleDownloadFiles`; new `handleDownloadZip` handles the ZIP path
- Both respect the `startAfter` timestamp filter

