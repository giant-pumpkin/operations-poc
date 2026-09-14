# ConnectIQ Design System — LLM build rules

ConnectIQ is the internal operational B2B platform for the Giant Pumpkin business
(CRM, deployment, subscriptions, inventory, support, customer dashboards). Build a
calm, precise, compact, data-forward interface. It is NOT a marketing site.
You may design creatively, but stay inside these tokens and rules for consistency.

## Themes — pick ONE per view, never mix

- LIGHT (default): every operational screen. Build this unless told otherwise.
- DARK: the SAME app on dark surfaces. Identical 14px density, 4px grid, radius scale
  and hues. Only the ground changes. Never hand-invert light tokens to fake it.
- PRESENTATION: decks, reports, customer-facing dashboards ONLY. Dark surfaces +
  larger type + 14px radius. NEVER on an operational screen, and its type sizes and
  14px radius never migrate into app code.

## Identity

- Logo: a thin EIGHT-POINT asterisk (vertical + horizontal + 2 diagonals, round caps,
  stroke ~8% of box). Scales to 1em, colour via currentColor. Never the Unicode \* glyph.
- Brand accent: pumpkin orange #FF6700. Marks logo, active nav, tabs, links, focus —
  i.e. CURRENT CONTEXT. Never the default filled button; never floods large areas.
- Footer lockup: the 8-point asterisk + "Built with <heart></heart> by ConnectIQ" + copyright line, above a
  hairline, muted until hover; on hover the mark rotates 90 deg on a calm spring. Use the SVG, never
  the Unicode \* or a 6-point (3-stroke) version. Heart beats (double-thump).

## Colour — light theme (use semantic vars, never raw hex in feature code)

Neutrals (warm): 0 #FFFFFF · 25 #FCFCFA · 50 #F6F7F3 · 100 #F0F1EC · 200 #E1E3DC ·
300 #CACDC4 · 400 #A2A59C · 500 #73776E · 600 #595D56 · 700 #3F3F3F · 800 #202020 · 900 #000000
Brand orange: 50 #FFF2E8 · 100 #FFDCC4 · 500 #FF6700 · 600 #E85E00 · 700 #C94F00
Success green: 50 #ECF8F2 · 500 #62C696 · 700 #278F63
Warning yellow: 50 #FFF9E6 · 500 #F1BF00 · 700 #9C7800
Danger red: 50 #FDEDEC · 500 #F2584B · 700 #B43128 (chart red #FF4848)
Info blue: 50 #EDF4FF · 500 #4C8FF7 · 700 #2466B9
Semantic roles:
background.canvas=neutral.50 surface=neutral.0 muted=neutral.100 inverse=neutral.900
foreground.primary=neutral.900 secondary=neutral.700 muted=neutral.500 accent=orange.500
border.default=neutral.200 focus=orange.500
action.primary = BLACK bg / white text (main commit, max 1/view); accent=orange (rare)
destructive=red.500; secondary=white + neutral.200 border
state.success/warning/danger/info = {50 bg, 500 line/icon, 700 text}
selected = green.50 bg + green.500 border
Fixed meanings: green=success/selected/complete, yellow=warning/pending/expiring,
red=error/destructive/incident, blue=informational/in-progress, orange=brand/highlight,
modelled #9B8FD8 = projected/forecast/scenario (CHARTS ONLY — see below).
STATUS IS NEVER COLOUR ALONE — always add text, icon, or shape.
Gradients: allowed in exactly TWO places — (1) chart bars (vertical alpha fade) and (2) KPI/metric
cards (faint semantic corner-wash, see below). Forbidden everywhere else: chrome, buttons, nav,
forms, dialogs, ordinary content cards.
Never implement purple as a brand, navigation, focus or interaction colour (the Figma
selection outline is not a brand colour). The ONE exception is chart.modelled #9B8FD8:
allowed as a chart series / legend entry / area fill, and nowhere else — not badges,
borders, controls or affordances. Always pair it with a dashed-or-hatched fill or a
"forecast" label, since it is a claim about certainty, not a status.

## Colour — dark theme (read semantic.dark, do NOT invert light tokens)

Surfaces: canvas #000000 (bleeds edge to edge) · recessed #0A0B0D (disabled/de-prioritised) ·
surface #13151A (default card/panel/table) · raised #1E1E1E (emphasised row, inline chip).
KEEP the slight blue cast in #13151A — a neutral grey card reads as flat black-and-white.
Text: #FFFFFF headings/figures · #D2D2D2 body · #94959D muted · #858585 units/footnotes.
Borders: rgba(255,255,255,.09) hairline · .18 default · .32 strong.
HUES ARE UNCHANGED from the light theme — all five clear AA on all three dark surfaces
(orange 6.25:1 on #13151A, success 8.73, warning-dark 8.55, danger 5.46, info 5.72).
The ONE exception: warning becomes #E0A83A on dark. #F1BF00 scores 10.60 there and
out-shouts the brand accent.
Tints are WASHES, never new hexes: state backgrounds = the hue at ~12% alpha over the
surface; chart area fills = the same hue at ~32%. This is what locks the themes together.
PRIMARY ACTION INVERTS on dark: white bg / black text. Orange is still not the default primary.
ELEVATION WITHOUT SHADOW: shadows read poorly on dark. Use the surface step + a hairline.
Menus/dialogs may use #1E1E1E + the .18 border. Never stack a strong border and strong shadow.
Paused / dormant / de-prioritised = #858585 at 50% opacity. NEVER red — that is a choice,
not a failure, and red is reserved.

## Presentation theme (decks, reports, customer dashboards — never operational screens)

Uses the dark surfaces, hues and semantics above. ONLY type, radius and layout differ:
body 16/400 (not 14) · lede 18/400 muted · card title 20/600 · heading 32/700 ·
display 48-56/700 tracking -.025em · eyebrow mono 12/500 uppercase 0.14em ·
data label mono 13/400 0.04em. RADIUS IS UNCHANGED — the presentation theme uses the
same 4/6/8/12/16/20/pill scale as the app. There is NO presentation-specific radius.
Ember's 14px card and 10px row were rejected as off-scale; use radius.xl (16px) if a
genuinely large presentation surface needs more curvature.
Layout: content max 1120px · margins ~4.5% of width · split ~55/40, evidence left and
argument right, never centred · eyebrow, headline, optional one-line lede, then a FULL
EMPTY BAND before content (the air under the title is doing work) · left accent bar 3px,
and a row with a left bar keeps SQUARE corners on that side · max 6 sequence steps ·
max 3 ratio-bar segments.
Discipline (enforced by hand here, since density is not doing it for you):
SPEND THE ACCENT ONCE — one eyebrow + one focal element per view; scarcity is the point.
LET NEUTRAL CARRY STRUCTURE — ~80% of any view is neutral.
DEPTH BEFORE HUE — a fifth series is a deeper fill of an existing hue, not a sixth colour.
NUMBER ONLY WHAT IS ORDERED — numbered steps mean genuine sequence, not a list.
Mono is the system voice (labels, figures, ids), never body copy; and never set a figure
inside a data row in the sans face. Keep uppercase mono at 11px or above.
Imagery: desaturated, cool-shifted, inside a rounded container with canvas visible around it.
An ambient accent wash at very low opacity may sit behind photography. Nothing else glows.

## Typography

FONTS: Display + Page title = "Neue Montreal" (licensed Pangram Pangram brand face, self-hosted via
@font-face from ./fonts, weight 700; Inter is the fallback). Everything else = Inter (system-ui stack).
Mono/data stack (DM Mono) for data only. Neue Montreal is NOT on Google Fonts and needs a webfont license.
display 32/700 (Neue Montreal) · page title 24/700 (Neue Montreal) · section 16-18/600 · body 14/400 ·
label 14/500-600 · meta 12 · uppercase data label 11/500/0.06em · KPI 32-36/500-600. Sentence case;
uppercase only for 11px data labels & table headers. Mono = ids, serials, codes, timestamps,
aligned tabular data — never body copy. Line length ~60-80ch for prose.

## Spacing (4px grid, 8px rhythm) & shape

Space: 4 8 12 16 20 24 32 40 48 64 (no 13/17/22/30). Radius: 6 tags · 8 fields/controls ·
12 cards/tables/panels · 16-20 dialogs · pill only for badges/switches (not every surface).
NEVER 14px or 10px — both explicitly rejected. The scale is identical in all three themes.
Flat design: normal cards = 1px neutral border, NO shadow. Shadow only on floating layers
(sm menus, md dropdowns/dialogs, lg modals). Focus = 2px orange ring (not a persistent border).

## Layout

Sidebar 224px (collapsed 64px). Page max 1440px. Padding 24 desktop / 16 tablet / 12 mobile.
Responsive: sidebar → drawer/rail, stack columns, tabs scroll horizontally, tables keep
readability via column priority or horizontal scroll. Do NOT just shrink all text.

## Controls & forms

Heights: 32 compact / 40 standard / 48 customer-facing. Labels above fields; helper &
validation directly below. Searchable selects match text inputs. Disabled stays readable.
Destructive actions = red + explicit wording. 2px orange focus ring with small offset.

## Navigation & tabs

Active sidebar item: quiet neutral or pale-green surface + narrow orange edge indicator.
Active tab: orange text + thin orange underline. Inactive = muted text; hover subtler than active.

## Feedback

Toasts: white surface + semantic left border + icon. Inline: pale semantic background.
success=green, warning=yellow, error=red, info=blue; orange only for workflow guidance.
Copy concise and actionable (what happened + what to do).
Accent lines (single stroke, orange by default): (a) left-rule note = 2px vertical bar + muted text
for explaining a behaviour/rule inline (quieter than a banner); may take a semantic colour when the
message is semantic, but meaning stays in the text. (b) header accent = a short 40x3px orange pill
bar above a section title (left in dense views, centred for customer-facing). Never a row of colours.

## Tables & data

Compact, white, bordered. 12px body, 11px uppercase headers (0.06em) on pale ground, mono ids.
Quiet neutral row hover; expanded rows very pale neutral. Status = badge (colour + word).
Avoid zebra striping unless it measurably helps scanning.

## Charts

Semantic palette, fixed meaning (green done, yellow scheduled, blue in-progress, orange
highlight/brand, red incident/spike, neutral baseline). Max 5 categorical colours. Dark
neutral tooltips (#2b2b2e, white bold title + muted period label) + white text; subtle grid.
Always label/legend — colour never the only signal.
GRADIENTS (charts ONLY — never chrome/buttons/cards/nav/forms): a single vertical ALPHA fade,
one hue per bar, DEEPEST AT THE BASE (axis) fading UP to transparent at the top. Strong stop LAST.
background: linear-gradient(180deg, rgba(R,G,B,.02) 0%, rgba(R,G,B,.18) 45%, rgba(R,G,B,.90) 100%)
green rgba(98,198,150) · yellow rgba(241,191,0) · blue rgba(76,143,247) · neutral rgba(140,140,130)
Anchor full-strength stop at the base so bars sit on the axis; fade up to transparent/very pale;
never fade one hue into another. A SELECTED/highlighted bar drops the gradient for a SOLID fill + ring.
KPI SIDE-WASH (2nd allowed gradient — KPI/metric cards only): a THIN semantic line hugging the LEFT
edge (brightest top-left, fading in fast), alpha-only, strength <=.28, ALWAYS with a coloured dot +
uppercase MONO label. Slim side accent, NOT a broad corner bloom.
background: radial-gradient(16% 82% at 0% 0%, rgba(R,G,B,.26) 0%, rgba(R,G,B,0) 60%)
green .26 · yellow .28 · blue .22 · red .22. Number stays near-black; tint is atmosphere not emphasis.
Never put this wash on an ordinary content card.

## Iconography

One outline family (Lucide preferred). 16 standard · 20 prominent · 24 major status.
Consistent stroke. Icons support labels, never replace ambiguous text. No mixed styles.

## Motion — communicates state, never decorates

120ms hover/press · 180ms standard · 240ms dialog/drawer · easing cubic-bezier(.2,0,0,1).
Looping motion only for genuinely live state: equaliser (playing), pulse (live connection),
flash-once (state changed, never on same-state poll), spin (request in flight), asterisk loader.
Respect prefers-reduced-motion. No bouncy/elastic/decorative animation. Do not animate large
areas on every data refresh.

## Accessibility

WCAG AA contrast, visible keyboard focus, 44px touch targets for field/mobile, labels tied to
controls, status not colour-only, error text names field + fix, charts give textual values,
modal focus trapped/restored, reduced-motion respected.

## Anti-drift hard rules

- Read the tokens before adding any colour/space/radius/shadow/font size; state missing tokens first.
- Never raw hex or framework palette classes (orange-500, gray-200, bg-black) in feature code.
- Never change design tokens as a side effect of a feature. Keep style vs functional changes separate.
- Never use orange as the default primary button, or flood large orange areas.
- Never turn operational screens into marketing layouts (no giant heroes, glassmorphism, heavy shadows).
- Never implement Figma purple selection outlines; never use chart.modelled outside a chart.
- Never mix two themes in one view; never hand-invert light tokens to build a dark surface.
- Never bring presentation type sizes into an operational screen.
- When a screenshot disagrees with the tokens, follow the tokens.
- Preserve the compact 14px operational density in BOTH app themes.
