// Peak Trekker — shared design tokens for new screens (polish pass)
// Single source for spacing, radii, accent rules. Imported into EmotionalMoments
// and IntroFlow via window globals.
//
// Green discipline:
//   • PRIMARY green = a confirmed user achievement (登顶完成 / 留证完整 / 已收录).
//   • Live-state green = a metric is currently active (临近峰顶 dot, 当前海拔 number IN-FLIGHT only).
//   • DO NOT use green for: navigation, hints, secondary CTAs, decorative backgrounds, dividers.
//   • Mono numerals always — green or not.

const PT = {
  // Spacing scale — 4px base
  s2: 4, s3: 8, s4: 12, s5: 16, s6: 20, s7: 24, s8: 32, s9: 40,

  // Radii — 3 sizes only
  rSm: 8,    // chips, inline tags, mono blocks
  rMd: 12,   // buttons, inputs, small cards
  rLg: 14,   // standard cards (matches existing v3 cards)
  rXl: 18,   // hero share posters

  // Card chrome — single canonical recipe
  card: {
    background: '#23272C',
    border: '1px solid #2F353B',
    borderRadius: 14,
  },
  cardSubtle: {
    background: 'rgba(255,255,255,.02)',
    border: '1px solid #2F353B',
    borderRadius: 14,
  },

  // Section label — uppercase mono, used by EMSection / archive year heads
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: '#8D959B',
    letterSpacing: '.18em', textTransform: 'uppercase',
    fontFamily: "'IBM Plex Mono',monospace",
  },
  // Hero altitude treatment — for any "this is THE number" moment
  heroAltitude: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em',
    fontVariantNumeric: 'tabular-nums',
  },
};

window.PT = PT;
