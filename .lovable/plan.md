

## Fix: "Ladda ner alla segment" opens video in tab instead of downloading

### Problem
The `download` attribute on `<a>` tags only works for same-origin URLs. Since the signed URLs point to the storage backend (different origin), the browser ignores the `download` attribute and navigates to the URL instead.

### Solution
In `src/components/RecordingsViewer.tsx`, change `downloadAllSegments` to:
1. Fetch each segment as a blob (reusing cached blobs from `segmentBlobsRef` when available)
2. Create a blob URL (`URL.createObjectURL`)
3. Trigger download via the blob URL (same-origin, so `download` attribute works)
4. Revoke the blob URL after download

This ensures files are actually downloaded with correct filenames instead of opening in the browser.

