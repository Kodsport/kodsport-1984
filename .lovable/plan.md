

## Plan: Change rooms to single "Kammaren"

### Changes needed

1. **Database migration** — Update the `valid_room` check constraint on `competitors` table to only allow `'Kammaren'`, and change the default from `'Rum 41'` to `'Kammaren'`.

2. **`src/components/CompetitorCapture.tsx`** — Change `ROOMS` to `['Kammaren']`. Since there's only one room, remove the room selector entirely and auto-set room to `'Kammaren'`.

3. **`src/components/AdminDashboard.tsx`** — Change `ROOMS` to `['Kammaren']`. The room tabs will show just one tab.

4. **`src/hooks/useScreenCapture.tsx`** — Change default room parameter from `'Rum 41'` to `'Kammaren'`.

