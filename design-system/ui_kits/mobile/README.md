# Peak Trekker · Mobile UI Kit

Pixel-fidelity recreations of the core mobile screens at **375 × 812**, built against `uploads/ui-interaction-spec.md` v0.2 and the product tokens in `../../colors_and_type.css`.

## Files

| File | Role |
|---|---|
| `index.html` | Gallery + click-through Flow. Open this. |
| `Primitives.jsx` | Tokens + shared components: `StatusBar`, `TopBar`, `TabBar`, `Chip`, `StatTile`, `AltitudeBar`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `PhonePlaceholder`, `PTIcons`. |
| `HomeScreenV2.jsx` | 意图分流 v2 — three intent rows + locked-target card. |
| `ExploreScreen.jsx` | Vertical mountain list with level + elevation chip. |
| `MountainDetailScreenV2.jsx` | Decision page v2: 4-stat row, 适不适合你, waypoints, weather. |
| `ActivityDetailScreen.jsx` | Asset layer: hero, 4-metric grid, altitude curve, photo grid, note, share CTA. |
| `ShareScreenV2.jsx` | 水印相机 v2 — template + main visual + field toggles. |
| `ProfileScreen.jsx` | 私人山行档案馆 — year-grouped timeline. |
| `HANDOFF.md` | Per-screen handoff notes: components, tokens, spacing, states, interactions. |

## Principles honored
- **One primary CTA per visual level.**
- **Elevation is the highest-priority signal** — mono digits + success green, always first in stat rows.
- **Realistic photo placeholders** — no cinematic glow, no poster aesthetics. Swap in real photos when available.
- **Maps are light reference only.** Weather is decision support only.
- **Share stays simple** — template + fields, no free editor.
- **Icons are inline SVG**, 1.8 stroke, two-tone — no emoji, no icon font.

## Known substitutions
- Fonts: Manrope + IBM Plex Mono from Google Fonts CDN (approved for now).
- Hero imagery: realistic SVG photo-placeholders with ridge silhouettes, vignette, and film grain until real photography is attached.
