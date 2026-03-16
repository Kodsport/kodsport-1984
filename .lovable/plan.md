

## Rebrand to Programmeringsolympiaden (progolymp.se theme)

### Changes

**1. Color Theme (`src/index.css`)**
- Primary/accent: `rgb(229, 188, 58)` → HSL ~`(46, 78%, 56%)`
- Secondary blue: `rgb(41, 118, 216)` → HSL ~`(214, 70%, 50%)`
- Background: dark navy/blue tones based on the blue color
- Foreground: light/white text with gold accents

**2. Branding Text Updates**
- `index.html`: Title and meta → "Programmeringsolympiaden"
- `src/components/Logo.tsx`: "Säkerhets" / "SM" → "Programmerings" / "olympiaden"
- `src/pages/Index.tsx`: All "Säkerhets-SM" references → "Programmeringsolympiaden"
- `src/index.css`: Comment update

**3. Rooms: "Kammaren" → "Chalmers", "KTH", "LTH"**
- `src/components/AdminDashboard.tsx` line 21: `const ROOMS = ['Chalmers', 'KTH', 'LTH'] as const;`
- `src/components/CompetitorCapture.tsx`: Replace hardcoded `ROOM = 'Kammaren'` with a room selector dropdown letting participants pick from Chalmers/KTH/LTH
- `src/hooks/useScreenCapture.tsx` line 239: Update default param from `'Kammaren'` to `'Chalmers'`

**4. Files touched**: `src/index.css`, `index.html`, `src/components/Logo.tsx`, `src/pages/Index.tsx`, `src/components/AdminDashboard.tsx`, `src/components/CompetitorCapture.tsx`, `src/hooks/useScreenCapture.tsx`

