# michaelwright.work — Claude Design Handoff

> A self-contained brief you can drop into a fresh Claude Design session.
> It gives Claude full context on the site's stack, design system, voice,
> what works today, and what's open for exploration.

---

## 1. What this site is

**michaelwright.work** is the personal portfolio of Michael Wright —
DevOps / Cloud Infrastructure Engineer with deep AWS expertise, currently
shipping multiple solo SaaS products on the side. The site has to do four
jobs at once:

1. **Land a senior cloud-engineering role** — front-load AWS / Deadline Cloud / VFX-infra credentials.
2. **Position Michael as an engineering leader** — "CEO speak" / technical-founder voice, not a junior portfolio.
3. **Show off solo-built products** — TRNSCODE, Graffiti, FloAud.io, rndr.work — each one a fully shipped product, not a side experiment.
4. **Stay readable on a phone in 10 seconds.**

Tone is **direct, technical, first-person, specific**. No marketing fluff.
When something is hard, the copy says so. When something is novel, the
copy quantifies it ("21 modules · 263+ lessons", "1,100+ tests", "POC
beat on-prem by 7× per frame on a real 20K shot").

---

## 2. Stack & runtime

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2** (App Router) |
| React | **19.2** with React Compiler enabled (`babel-plugin-react-compiler`) |
| Language | TypeScript 5 |
| Styling | **Inline `style={{}}` props + design tokens from CSS variables.** No Tailwind class soup on this site; no CSS modules. (Tailwind v4 + PostCSS are installed but used sparingly — globals.css only.) |
| Motion | `motion` (Framer Motion successor) — fade/slide reveals on scroll, drawer transitions, dropdown panels |
| Carousel | Embla (`embla-carousel-react` + autoplay plugin) |
| MDX | `@next/mdx` + `next-mdx-remote` + `rehype-pretty-code` + `shiki` for blog posts |
| Forms | `react-hook-form` + `@hookform/resolvers` + `zod` |
| Email | Resend (contact form) |
| Lightbox | `yet-another-react-lightbox` (gallery) |
| Icons | `lucide-react` (1.x) |
| Hosting | Vercel |

> ⚠️ **Next.js 16 has breaking changes from your training data.** Before
> writing code that touches routing, metadata, server components, or
> caching, read the relevant guide in `node_modules/next/dist/docs/`.
> `AGENTS.md` in the repo root enforces this rule.

---

## 3. Design tokens

### Colors (used as literal hex strings inline today — no CSS-var indirection)

| Role | Hex | Where it lives |
|---|---|---|
| **Page background** | `#080D1A` / `rgba(8,8,12,0.85)` | body + page-header glass panels |
| **Card background** | `rgba(15,15,21,0.9)` | every card / panel |
| **Inner card background** | `rgba(8,8,12,0.6)` | sub-grid cells inside cards |
| **Border (default)** | `#1F1F2E` | card edges, dividers |
| **Border (subtle)** | `#27273A` | tag chips, secondary buttons |
| **Crimson (primary accent)** | `#FF3B2F` | brand, primary CTAs, FloAud.io, TRNSCODE, "in-progress" status, hero accent line |
| **Crimson glow bg** | `rgba(255,59,47,0.08)` | crimson-tinted soft fills |
| **Crimson glow border** | `rgba(255,59,47,0.2)` | crimson-tinted soft borders |
| **Teal (secondary accent)** | `#7FDBFF` | rndr.work, Graffiti, "live" status, cloud / infra context |
| **Teal glow bg** | `rgba(127,219,255,0.08)` | |
| **Teal glow border** | `rgba(127,219,255,0.2)` | |
| **Text primary** | `#F0F2F8` | headings, important values |
| **Text secondary** | `#787F96` | body copy, supporting info |
| **Text tertiary / labels** | `#3C3F52` | uppercase mono labels, metadata |
| **Status dot — completed** | `#787F96` | gray, neutral |

### Typography (CSS vars, loaded in `src/lib/fonts.ts`)

| Variable | Family | Used for |
|---|---|---|
| `--font-display-var` | **Syne** (700 / 800) | h1–h3, project names, hero text, anything that should look declarative |
| `--font-body-var` | **Outfit** (500 / 600) | buttons, paragraphs of UI copy |
| `--font-mono-var` | **JetBrains Mono** | eyebrow labels (`UPPERCASE, 0.18em tracking`), tags, status pills, metric values |

### Spacing & rhythm

- Cards: `12px` outer radius, `8px–10px` inner radius. `1px` border, plus an optional top accent border for hero cards (`rgba(255,59,47,0.3)` / teal equivalent).
- Section vertical rhythm: page header `3rem padding`, content body `4rem padding`, section blocks `marginBottom: "4rem"` or `"5rem"` between major sections.
- Card internal padding: header `2rem`, body sections `1.75rem 2rem`, tag rows `1.25rem 2rem`.
- Max content width: `1100–1200px`.
- Sticky nav offset: every full page starts with `paddingTop: 66` to clear the fixed nav.

### Status pill pattern

```
[● Live]   crimson dot, soft bg, soft border, uppercase mono label
[● In Progress]
[● Completed]   gray
```

The dot uses `boxShadow: 0 0 5px <color>` for a slight glow. Always paired with uppercase tracked label in JetBrains Mono.

### Eyebrow label pattern

```
[icon] PERSONAL · DISTRIBUTED SYSTEMS
```

- Crimson (or accent) text, `0.6875rem`, `font-weight: 600`, `letter-spacing: 0.18em`, uppercase, mono font, optional small lucide icon to the left.

### Card sub-grid pattern (FloAud.io's "6 tools · 1 platform", TRNSCODE's "6 components · 1 fleet", Graffiti's "6 modules · 1 desktop app")

A `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` of small cards, each with:
1. Accent-colored mono label
2. Syne bold name
3. Body sentence in `#787F96`

This pattern is the site's strongest visual signature — clean rhythm, scannable.

---

## 4. File layout

```
src/
  app/
    layout.tsx                 # Root layout: NodeNetworkCanvas + Nav + PageWrapper + Footer + AdminPanel
    page.tsx                   # Home (hero slider + about)
    not-found.tsx / error.tsx / loading.tsx
    opengraph-image.tsx        # OG image generator
    resume/page.tsx
    projects/
      page.tsx                 # Projects index (TRNSCODE → Graffiti → FloAud.io → rndr.work hero cards + GPL grid)
      trnscode/page.tsx        # Detail page
      graffiti/page.tsx
      floaudio/page.tsx
      rndrwork/page.tsx
    blog/
      page.tsx                 # Index
      [slug]/page.tsx          # MDX detail
    gallery/{layout,page}.tsx
    contact/page.tsx
  components/
    background/
      NodeNetworkCanvas.tsx    # Background canvas effect (always visible behind content)
      AdminPanel.tsx           # Hidden dev controls
    blog/
      MDXComponents.tsx
      PostCard.tsx
    contact/ContactForm.tsx
    context/NodeNetworkContext.tsx
    gallery/{GalleryGrid,LightboxWrapper}.tsx
    hero/
      HeroSlider.tsx
      HeroSlide.tsx
      HeroTextReveal.tsx
      SlideProgress.tsx
    layout/
      Nav.tsx                  # Fixed top nav w/ dropdown + mobile drawer
      Footer.tsx
      PageWrapper.tsx
    resume/
      CertBadges.tsx
      ResumeTimeline.tsx
      SkillsMatrix.tsx
    sections/
      AboutSection.tsx
      SectionReveal.tsx        # Scroll-triggered fade/slide wrapper (motion)
  data/
    projects.data.ts           # Project type + personalProjects + gplProjects + floaudTools + rndrTiers + trnscodeModules + graffitiModules
    resume.data.ts
    heroSlides.data.ts
    gallery.data.ts
  lib/
    blog.ts                    # MDX loader
    fonts.ts                   # Syne / Outfit / JetBrains Mono next/font setup
    metadata.ts                # buildMetadata() helper
```

---

## 5. Pages that exist today

| Route | What it does |
|---|---|
| `/` | Hero slider (full-bleed editorial slides w/ HeroTextReveal) → AboutSection |
| `/#about` | About anchor on home |
| `/resume` | ResumeTimeline + CertBadges + SkillsMatrix |
| `/projects` | Personal hero cards (TRNSCODE, Graffiti, FloAud.io, rndr.work) → divider → GPL Technologies notable-work grid |
| `/projects/trnscode` | Detail: pitch → 6-component grid → 5-step pipeline → solo-build list → stack → cross-links |
| `/projects/graffiti` | Detail: pitch → 6-module grid → 5 architecture decisions → solo-build list → 4 pricing tiers → stack → cross-links |
| `/projects/floaudio` | Detail: pitch → 6-tool grid → 5 architecture decisions → solo-build list → stack → cross-links |
| `/projects/rndrwork` | Detail: pitch → 4 compute tiers grid → 5 architecture decisions → solo-build list → stack → cross-links |
| `/blog` | Post index (PostCard grid) |
| `/blog/[slug]` | MDX article w/ rehype-pretty-code, sticky sidebar (tags + back link) |
| `/gallery` | Lightbox grid |
| `/contact` | ContactForm → Resend |

---

## 6. Voice & tone reference

The site's copy is consistent across pages. Treat these as the canonical
examples — match them when writing anything new.

### Project descriptions (always one sentence, em-dash separated)

> "**FloAud.io** — Browser-based professional audio platform — six studio-grade tools and a full audio engineering education system, built as solo technical founder from architecture through product."

> "**rndr.work** — Cloud rendering platform built on AWS Deadline Cloud — modern GPU infrastructure, DCC-native submitters, and transparent per-node-hour pricing for VFX professionals."

> "**TRNSCODE** — Distributed video transcoding for on-prem hardware — slices any video into keyframe-aligned chunks, dispatches them across every encoder on the LAN, and stitches the output back together. Built as solo technical founder from chunking algorithm through frozen exes."

### Highlight bullets (verb-first past tense, concrete tech specifics)

> "Architected and deployed the full multi-tenant SaaS platform on AWS, including audio processing pipelines, credit billing system, and user authentication"

> "Wrote a cost-based scheduler that scores idle workers against pending chunks on four signals: historical encode speed (EMA per worker × preset), network distance, queue delay, and capability fit"

> "Designed cross-account RLM licensing via VPC Lattice to let Deadline Cloud workers reach the studio's on-prem license server without bridging networks"

### Eyebrow / section labels (uppercase, JetBrains Mono, 0.18em tracking)

> `PERSONAL · DISTRIBUTED SYSTEMS`
> `6 COMPONENTS · 1 FLEET`
> `WHAT I BUILT`
> `COMPUTE TIERS · PER NODE-HOUR`

### Hero h1 + subtitle pattern

```
[Eyebrow label]
[H1 — short, declarative — "Work that matters" / "rndr.work" / "Graffiti"]
[Subtitle — one sentence in #F0F2F8 at 1.125rem, 680px max-width]
[Optional small status pill + CTA row]
```

### Words to avoid

- "Cutting-edge" / "innovative" / "revolutionary" / "seamlessly"
- "We are passionate about" / "world-class" / "best-in-class"
- Generic marketing superlatives. The numbers do that job.

### Words / phrases that fit the voice

- "Built as solo technical founder"
- "From X through Y" (e.g. "from architecture through product", "from chunking algorithm through frozen exes")
- "Shipped"
- Concrete numbers: counts, ms, MB, GB, hardware names

---

## 7. What works today (preserve)

- **The hero-card pattern on `/projects`** — top accent border, 56px logo glyph, status pill, primary CTA + secondary "View project →" link, "What I built" highlights grid, sub-grid of tools/modules/tiers, tag row. Consistent across all four personal projects.
- **The dark navy + crimson + teal restraint** — almost no other color shows up, and that restraint is what makes the accents land.
- **JetBrains Mono uppercase tracked labels** — these read like instrument-panel chrome and make the page feel engineered.
- **`SectionReveal` motion** — gentle fade + slight Y on scroll, never more.
- **The fixed nav with hover dropdown** — projects now expand into a per-project menu, mobile drawer mirrors with indented children.
- **Background `NodeNetworkCanvas`** — animated particle/connection canvas behind everything, low-key, never distracts.

---

## 8. Open invitations for design exploration

These are areas where the site is functional but not yet *distinctive*.
Feel free to push.

1. **Hero on `/`** — the slider works but could feel more editorial. Consider: heavier typography hierarchy, an anchored eyebrow + dateline pattern (`MAY 2026 · LOS ANGELES`), or a single static "magazine cover" hero in place of the slider for first-time visitors.
2. **Project detail page hero** — the four detail pages share a layout. Each could be more bespoke — TRNSCODE could lean into an "encode rack" visual metaphor, Graffiti into a photo-grid texture, FloAud.io into waveform shapes, rndr.work into a render-progress grid.
3. **`/resume` density** — the timeline / cert badges / skills matrix could be tightened or remixed into a single one-page "executive resume" layout that prints well.
4. **Section dividers** — currently a single 1px gradient line. Could be a more distinctive horizontal ornament that signals chapter breaks.
5. **Tag chips** — they're functional but the lowest-contrast element on the page. Could become a stronger visual rhythm (e.g. category-colored or with a leading icon).
6. **Footer** — minimal today. Could carry the social links + brand affirmation more confidently.
7. **Empty / 404 / error states** — not yet themed beyond defaults. A signature 404 would be on-brand.
8. **Blog post detail** — single-column with a sidebar; could become more editorial with pull quotes, oversized first letters, side-margin annotations.
9. **GPL Technologies "Notable Work" grid** — utilitarian today. Could carry more visual weight per card (small logo, role, year, color-coded engagement type).
10. **A "Currently shipping" home-page section** — surface TRNSCODE + Graffiti progress (status pill + last-updated stamp) on the home page so visitors see the work in motion.

---

## 9. Constraints & non-negotiables

- **Stay inside the existing palette.** Crimson + teal + the four neutrals are the system. New accents would need a strong reason.
- **No CSS frameworks beyond what's installed.** Tailwind exists but is barely used; please don't introduce shadcn, daisyUI, or a new component library. Inline style props remain the convention.
- **No client-side state libraries** (Redux, Zustand, etc.). React state + context is enough.
- **Server Components by default.** Only add `"use client"` when a component needs interactivity (state, effects, motion event handlers, browser APIs).
- **`motion` only** — no other animation library.
- **No image hosting changes.** Continue using static `/public/` assets and `next/image`.
- **Don't break the existing nav structure** — Home / About / Resume / Projects / Blog / Contact, with Projects dropdown.
- **Voice is non-negotiable** — match the references in §6. If a design needs new copy, draft it in that voice.

---

## 10. Quick-start prompt for Claude Design

> I'm working on **michaelwright.work** — a Next.js 16 personal portfolio.
> See `CLAUDE_DESIGN_HANDOFF.md` for the full design system, voice, file
> layout, and current state. The codebase uses inline-style design tokens
> (not Tailwind classes), Syne / Outfit / JetBrains Mono typography, and
> a dark navy + crimson + teal palette. I'd like to explore [SECTION /
> PAGE / FEATURE]. Stay inside the existing palette and voice (see §6
> for tone examples). Match the hero-card pattern on `/projects` as the
> visual benchmark.

---

## 11. Quick-reference snippets

### Card shell

```tsx
<div
  style={{
    background: "rgba(15,15,21,0.9)",
    border: "1px solid #1F1F2E",
    borderTop: "1px solid rgba(255,59,47,0.3)",   // accent top border (optional)
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: "1.5rem",
  }}
>
  {/* … */}
</div>
```

### Eyebrow label

```tsx
<div
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    color: "#FF3B2F",
    textTransform: "uppercase",
    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
  }}
>
  <Icon size={13} />
  LABEL TEXT
</div>
```

### Display h2

```tsx
<h2
  style={{
    fontFamily: "var(--font-display-var,'Syne'),sans-serif",
    fontWeight: 800,
    fontSize: "clamp(1.5rem,3vw,2rem)",
    color: "#F0F2F8",
    margin: "0 0 1.25rem",
  }}
>
  Heading
</h2>
```

### Status pill (with glow dot)

```tsx
<span
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.625rem",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#FF3B2F",
    background: "rgba(255,59,47,0.08)",
    border: "1px solid rgba(255,59,47,0.2)",
    padding: "3px 8px",
    borderRadius: 4,
    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
  }}
>
  <span
    style={{
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: "#FF3B2F",
      boxShadow: "0 0 5px #FF3B2F",
      display: "inline-block",
    }}
  />
  IN PROGRESS
</span>
```

### Reveal-on-scroll wrapper

```tsx
import SectionReveal from "@/components/sections/SectionReveal";

<SectionReveal delay={0.07}>
  {/* content */}
</SectionReveal>
```

---

*Document last updated: 2026-05-21.*
