---
name: peak-trekker-design
description: Use this skill to generate well-branded interfaces and assets for Peak Trekker (真山), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key files to read first:
- `README.md` — product, content fundamentals, visual foundations, iconography, index
- `colors_and_type.css` — tokens as CSS vars
- `source-docs/ui-interaction-spec.md` — source of truth for flows + rules
- `ui_kits/mobile/` — recreated mobile screens (375×812) and primitives
- `preview/` — small cards that show every token and component in isolation

Core constraints:
- Mobile-first, 375px base width, dark outdoor visual language.
- One primary CTA per visual level. Elevation (海拔) is always the highest-priority signal.
- Chinese-first copy, no emoji, no exclamation points, no dev-speak.
- Inline-SVG icons at 1.8 stroke, two-tone; never icon font or emoji.
- Maps are light reference only. Weather is decision support only. Share = template + fields, never a poster editor.

If creating visual artifacts (mocks, throwaway prototypes, slides), copy assets out and create static HTML files. If working on production code, follow the rules here and the spec to match the shipped product.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions (screen? flow? surface? fidelity? variations?), then act as an expert designer for Peak Trekker who outputs HTML artifacts or production code as appropriate.
