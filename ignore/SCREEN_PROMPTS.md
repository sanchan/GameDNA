# SCREEN_PROMPTS.md — GameDNA UI Prompts for UXPilot

## Design System

**App name:** GameDNA
**Style:** Dark theme gaming app, modern and minimal. Similar to Steam meets Tinder.
**Font:** System UI / sans-serif.
**Border radius:** 10px (0.625rem).
**Color palette:**
- Background: Very dark near-black (#1a1a1a)
- Card background: Dark gray (#2e2e2e)
- Primary/Accent: Warm orange `oklch(0.646 0.222 41.116)` — used for branding, CTAs, active states
- Foreground text: Near-white (#f5f5f5)
- Muted text: Medium gray (#a3a3a3)
- Muted/Secondary background: Dark gray (#3a3a3a)
- Positive/Yes: Green (#22c55e)
- Neutral/Maybe: Yellow (#eab308)
- Negative/No: Red (#ef4444)
- Radar chart accent: Indigo (#6366f1)
- Destructive: Dark red

---

## Screen 1 — Landing Page

> Design a dark-themed landing page for a gaming app called "GameDNA". Full-screen centered layout with a large title logo where "Game" is in the primary orange accent color and "DNA" is white. Below the title, a tagline: "Discover your next favorite game". A short paragraph explains that the app analyzes your Steam library to build a taste profile and recommend games using AI. A single large call-to-action button labeled "Sign in with Steam" in the primary orange color with white text. Minimal, clean, no sidebar, dark near-black background. The page has a top navigation bar (see Navbar).

---

## Screen 2 — Discovery (Swipe Interface)

> Design a Tinder-style game discovery screen for a dark-themed gaming app. At the top, a collapsible filter panel with fields for min/max price, minimum review score, and genres (comma-separated input). Below the filters, a horizontal progress bar showing "X swiped / Y remaining" with the filled portion in orange. Center of the screen: a game card (max-width ~384px) showing a media carousel (header image with navigation arrows and fullscreen button), game title with bookmark/wishlist/Steam link icons, a color-coded review badge (green for good, yellow for mixed, red for bad) with a review score bar, genre pills in secondary color, price, release date, short description (3 lines max), and developer credit. Below the card: 3 circular swipe action buttons — a large red X button (No), a smaller yellow ? button (Maybe), and a large green heart button (Yes). At the bottom, a subtle keyboard shortcut hint: "← No · ↓ Maybe · → Yes". Cards animate in with a scale-up fade, and swipe out with rotation effects (left for no, right for yes, down for maybe). Dark background, card has slightly lighter dark gray background with rounded corners and shadow.

---

## Screen 3 — Profile Page

> Design a user profile page for a dark-themed gaming app. Top section: large circular avatar (80px), display name in bold, and a "Sync Library" button with a refresh icon. Below: a stats row with 3 columns showing "Games", "Hours Played", and "Swipes" with large numbers and small labels. Next section: a radar chart visualization (recharts-style) showing the user's top genres as data points on a spider/radar chart with indigo (#6366f1) fill at 30% opacity and slate-colored grid lines. Below that: "Top Tags" section with horizontally wrapping pills/badges in muted gray background. Then a collapsible "All Tags" section with a scrollable table (sticky header) with columns: Tag name, Score (number), Status toggle button ("Active" in green or "Ignored" in muted). Next: "Swipe History" section with 3 horizontal stat bars — green bar for "Yes" count, yellow bar for "Maybe", red bar for "No", each showing count and percentage. Then an "AI Summary" card with a text block explaining the user's gaming taste. Finally: two buttons at the bottom — "Export Data" and "Import Data" with appropriate icons. All on dark background.

---

## Screen 4 — Recommendations (For You)

> Design an AI-powered game recommendations page for a dark-themed gaming app. Header with title "For You" and a "Regenerate" button with a refresh icon. Below: a responsive 3-column grid (1 col mobile, 2 tablet, 3 desktop) of game recommendation cards. Each card has: a header image (16:9 aspect ratio), game title, action buttons (bookmark, wishlist, score percentage badge color-coded green/yellow/red based on review score), up to 4 genre/tag pills, a 2-line AI explanation of why the game was recommended, price, a "Why this?" link that opens a modal, and a "Dismiss" button. Loading state: 6 skeleton cards with pulsing animation. Empty state: centered text "No recommendations yet" with a prompt to sync library first. Dark card backgrounds with rounded corners and subtle shadows.

---

## Screen 5 — "Why This Game" Modal

> Design a modal overlay for a dark-themed gaming app that explains why a game was recommended. Fixed centered modal on a blurred dark backdrop (60% black). Modal card (max-width ~512px, max-height 80vh) with: a header image of the game (16:9 aspect ratio), title "Why [Game Name]?" in bold, a close X button in the top-right corner. Scrollable content area with streaming text explanation from AI (text appears word by word with a blinking orange cursor indicator at the end while loading). Smooth fade-in animation (0.2s). Closes on Escape key or clicking backdrop.

---

## Screen 6 — My Lists Page

> Design a multi-tab list management page for a dark-themed gaming app. Top: a horizontal tab bar with 3 tabs — "Library", "Bookmarks", "Wishlist". Active tab has orange underline/text, inactive tabs are muted gray with hover effect. Next to tabs: a search input with a magnifying glass icon on the left. Below: a vertical list of game entries. Each entry is a horizontal row with: a game thumbnail (16:9, ~96px wide), game title (bold, clickable), up to 3 genre pills (truncated), and action buttons. Library entries also show formatted playtime ("X hours" or "Never played") and a review score with color-coded text. Bookmark entries have additional "Add to Steam Wishlist" and "Remove" buttons. List items have hover highlight effect. Loading state: skeleton rows with pulse animation. Empty states for each tab. Dark background with slightly lighter card rows.

---

## Screen 7 — History Page

> Design a swipe history page for a dark-themed gaming app. Top: a search input with magnifying glass icon, and a segmented button group filter with options "All", "Yes", "Maybe", "No" — active filter is highlighted with accent background. Below search: a results count label (e.g., "42 results"). Main content: a paginated vertical list of game entries. Each entry has: thumbnail image (16:9), game title (clickable link), genre pills, swipe date in muted text, a bookmark toggle button, a wishlist button, and 3 inline decision buttons (Yes/Maybe/No) where the current decision is highlighted with its respective color (green/yellow/red background at low opacity with colored border). Users can change their decision by clicking a different button inline. Bottom: pagination controls with "Previous" and "Next" buttons and "Page X of Y" text. All on dark background.

---

## Screen 8 — Game Detail Page

> Design a full game detail page for a dark-themed gaming app. Top: a full-width header image (hero banner) of the game. Below: game title in large bold text with 3 action icon buttons (bookmark toggle, wishlist toggle, external Steam link). Next row: price (formatted from cents, bold), review label text, review percentage, and review count in parentheses — all color-coded by score. A short description paragraph. Then metadata sections in a 2-column responsive grid: "Genres" (pill badges), "Tags" (up to 12 pill badges), "Developers", "Publishers", "Release Date", "Platforms" (Win/Mac/Linux icons or text). At the bottom (only shown if the game hasn't been swiped yet): 3 action buttons spanning the width — "Not for me" (red outline), "Maybe" (yellow outline), "Interested" (green outline). Dark background, content constrained to max-width with padding.

---

## Screen 9 — Backlog Page

> Design an unplayed games backlog page for a dark-themed gaming app. Header: title "Backlog" with an "Analyze with AI" button (primary orange). When AI analysis is available, show a highlighted recommendations section at top with numbered entries (1, 2, 3... in orange circles). Each AI recommendation row has: rank number, game thumbnail, game name in bold, and an AI-generated reason text. These rows have an orange left border (30% opacity, 60% on hover). Below the AI section: the main backlog list — vertical rows of unplayed games. Each row: thumbnail, game title (clickable), playtime ("Never played" or "X hours"), review score (color-coded green/yellow/red), genre pills (up to 3), bookmark button, and wishlist button. Games on the Steam wishlist show a small "Wishlist" badge pill in orange. Loading state: spinner with "syncing" text. Empty state: "No unplayed games found". Dark background.

---

## Component — Navbar

> Design a sticky top navigation bar for a dark-themed gaming app. Left: "GameDNA" logo text where "Game" is in orange accent and "DNA" is white, clickable to home. Center (desktop only): horizontal navigation links — "Discover", "For You", "My Lists", "Backlog", "History", "Profile". Active link is white bold, inactive links are muted gray with white on hover. Right: user avatar (32px circle), display name (hidden on mobile), and a "Logout" text link. On mobile: a hamburger menu icon (3 lines) that toggles to an X, opening a dropdown with all nav links vertically stacked. Below the navbar (when syncing): a progress banner showing sync status text, percentage, and a horizontal progress bar with orange fill that animates smoothly. Navbar has bottom border in dark gray, background matches app background.

---

## Component — Game Card (Detailed)

> Design a game info card component for a dark-themed gaming app (max-width ~384px). Top: an image carousel area with the game's header image. Carousel has left/right arrow buttons (appear on hover), a fullscreen expand button (top-right corner), and a slide indicator "X / Y" (bottom-center). All controls are semi-transparent and appear on hover. Below the image: a content section with padding. First row: game title (large bold) and 3 small icon buttons (bookmark heart, wishlist flag, external Steam link). Next: a review badge — a colored label (e.g. "Very Positive") with the percentage and review count, plus a thin progress bar showing the score visually (colored green/yellow/red). Genre pills in a wrapping row (up to 5, secondary background color). Price in bold and release date in small muted text. Short description text (max 3 lines, truncated). Developer name in extra-small muted text at bottom. Card has dark gray background, rounded-xl corners, and subtle shadow.

---

## Component — Media Gallery (Fullscreen)

> Design a fullscreen media gallery/lightbox for a dark-themed gaming app. Fixed overlay covering entire screen with 90% black background. Center: main media display (max-width ~1024px, 16:9 aspect ratio). Images shown at full size with object-contain. Videos show a thumbnail with a large centered play button (circular, 64px, semi-transparent white) — clicking plays the video inline. Top-left: slide counter "X / Y". Top-right: close button (X icon) with semi-transparent background. Left and right edges: navigation arrow buttons (centered vertically, semi-transparent). Bottom center: a horizontal scrollable thumbnail strip with small 16:9 thumbnails. Active thumbnail has white border and slight scale-up, inactive thumbnails are dimmed (60% opacity). Video thumbnails have a small play icon overlay. Opening animation: zoom-in from 85% to 100% scale. Keyboard navigation: arrows to browse, Escape to close.
