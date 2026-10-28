# Aemeath Guidebook (`/feature`) Asset & Provenance Record

This document records the source, license, and provenance of all assets and fonts used by the Aemeath Guidebook feature, in strict accordance with the project's non-generative asset policy.

---

## 1. Aemeath Cubie Asset

- **File Path in Repo:** `assets/cubie.png`
- **Resolution:** $1024 \times 864$ pixels (RGBA format with transparent background)
- **Source:** User-provided original transparent artwork supplied directly during the guidebook implementation.
- **License / Usage:** Permitted for in-app mascot and guidebook header sticker usage.
- **Generative AI Policy Compliance:** 100% compliant. No AI-generation models were used to synthesize, interpolate, or modify this artwork.

---

## 2. Animated Companion Avatar & Atlas

- **File Paths in Repo:**
  - `assets/pet/spritesheet.webp`
  - `assets/pet/atlas.json`
- **Source:** Pre-existing published project asset (`aemeath-mini--cunuo`).
- **Animation Rows Utilized:**
  - `idle`: row 0, 6 frames, 8 fps
  - `jumping`: row 4, 5 frames, 10 fps
- **Engine Reuse:** Uses the official `src/atlas.js` module (`AemeathAtlas.frameRect()`) for coordinate mapping onto the guidebook's HTML5 `<canvas>`. No separate competing animation engine was introduced.

---

## 3. Typography & Font Policy

- **Declared Family:** `"Lagu Sans", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`
- **Licensing Constraint:** Lagu Sans Light is freeware, whereas other weights are commercial/premium.
- **Implementation Guarantee:**
  - The guidebook does not bundle or synthesize artificial bold weights of Lagu Sans.
  - Headings and body copy rely on the native system font stack fallback where appropriate.
  - No remote font CDNs or runtime font downloads are performed.

---

## 4. UI Elements & Decorations

- **Styling:** Authored entirely with semantic HTML5 and vanilla CSS (`renderer/feature-window.css`).
- **Icons:** Inline hand-crafted SVG shapes and standard unicode glyphs.
- **Privacy & Offline Integrity:**
  - The guidebook operates 100% locally on the host machine.
  - No network requests, live LLM generation, or telemetry are initiated.
