import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, GitBranch, Globe2, Layers, Swords, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import Screenshot from "@/components/media/Screenshot";
import { personalProjects, reactor48Modules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Reactor 48",
  description:
    "A persistent post-nuclear text MMO where every survivor is a real person — open PvP, a player-run economy, and faction wars fought over days. Built as solo technical founder.",
  path: "/projects/reactor48",
});

const project = personalProjects.find((p) => p.id === "reactor48")!;

const ACCENT = "#7FDBFF";
const ACCENT_SOFT_BG = "rgba(127,219,255,0.08)";
const ACCENT_SOFT_BORDER = "rgba(127,219,255,0.2)";

const DESIGN_PILLARS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "01 Persistence over sessions",
    icon: <Globe2 size={16} />,
    body:
      "The world is server-paced, not session-paced. Stamina regenerates, crimes cool down, caravans arrive, and rival players move while you're logged off. That single decision reframes the whole design — it makes a ten-minute daily play session viable, and it means the cost of ignoring the world for a week is real. There are no seasonal resets and no wipes: one continuous world, and the consequences carry.",
  },
  {
    title: "02 Honest numbers",
    icon: <Zap size={16} />,
    body:
      "Every action shows its odds before you commit — success percentage, payout range, stamina cost, body burden, and the critical-failure chance that puts a Tracker on your scent. Nothing is resolved client-side. The design bet is that transparency creates more tension than mystery does: when players can see exactly what they're risking, choosing to risk it means something.",
  },
  {
    title: "03 An economy with no faucet",
    icon: <Layers size={16} />,
    body:
      "There are no vendor prices and no fixed loot tables. Every item in circulation was scavenged, crafted, or looted by a player, and priced by one. List fees and sale tax burn currency back out of the supply, so inflation has a counter-pressure. Moving goods between regions is a real arbitrage play — and the corridor between them is where other players are waiting.",
  },
  {
    title: "04 Consequences that persist",
    icon: <Swords size={16} />,
    body:
      "Getting knocked down isn't a respawn. You land in The Ward with a triage timer running and an injury that follows you out — cracked ribs at −10% accuracy until someone stabilizes you. Five skills with no respec means every training decision is permanent. The result is a world where players carry visible history, and where helping a stranger off the floor is a genuine choice rather than a scripted event.",
  },
];

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        color: ACCENT,
        textTransform: "uppercase",
        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        marginBottom: "0.75rem",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

export default function Reactor48ProjectPage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Page header */}
      <div
        style={{
          background: "rgba(8,8,12,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1F1F2E",
          padding: "3rem clamp(1.25rem, 5vw, 4rem)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.75rem",
              color: "#787F96",
              textDecoration: "none",
              marginBottom: "1.5rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              letterSpacing: "0.08em",
            }}
          >
            <ArrowLeft size={13} /> All projects
          </Link>

          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: ACCENT,
              textTransform: "uppercase",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            }}
          >
            Personal · Persistent MMO
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2.25rem,4.5vw,3.5rem)",
              color: "#F0F2F8",
              margin: "0 0 0.75rem",
              letterSpacing: "-0.01em",
            }}
          >
            Reactor 48
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            A persistent post-nuclear MMO where every survivor on the map is a real person — and none of them are safe from each other.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://reactor48.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.6rem 1.4rem",
                background: ACCENT_SOFT_BG,
                border: `1px solid ${ACCENT_SOFT_BORDER}`,
                color: ACCENT,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
              }}
            >
              Visit reactor48.com <ArrowUpRight size={14} />
            </a>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 0.9rem",
                background: ACCENT_SOFT_BG,
                border: `1px solid ${ACCENT_SOFT_BORDER}`,
                color: ACCENT,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              Early Access · Solo Founder
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)" }}>
        {/* The pitch */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              A world that keeps turning after you close the tab.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              Reactor 48 is a turn-based, persistent post-nuclear MMO played entirely in the browser. There are no NPCs to farm and no scripted encounters — every survivor on the map is another player, the entire economy is goods they scavenged and priced themselves, and the wars are fought between factions of real people over days at a time.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              The design is built around a single constraint: the world is server-paced, so it moves whether or not you&rsquo;re logged in. That makes it playable in ten minutes a day, and it makes every absence cost something. No seasonal resets, no wipes, no wallet that buys power — one continuous world where the strongest survivor on the map earned it.
            </p>
          </section>
        </SectionReveal>

        {/* Hero screenshot */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <Screenshot
              src="/images/projects/reactor48/01-hero.png"
              alt="The Reactor 48 landing page — the REACTOR48 wordmark over the tagline 'An American Survival', with a call to create a survivor and a note that it takes ninety seconds to your first crime."
              width={1432}
              height={700}
              priority
              caption="reactor48.com — early access, free to play, ninety seconds to your first crime."
            />
          </section>
        </SectionReveal>

        {/* Systems grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 systems · 1 world" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What you&rsquo;re walking into
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
              {reactor48Modules.map((mod) => (
                <div
                  key={mod.name}
                  style={{
                    padding: "1.25rem 1.375rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.12em", color: ACCENT, textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.3rem" }}>
                    {mod.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8", marginBottom: "0.5rem" }}>
                    {mod.name}
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.65, margin: 0 }}>
                    {mod.detail}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1.5rem" }}>
              <Screenshot
                src="/images/projects/reactor48/02-game-screens.png"
                alt="Six in-game Reactor 48 screens shown side by side — open-PvP combat resolution, The Ward triage timer with a cracked-ribs injury, the player-run item market, a crime attempt showing success odds and critical-fail chance, a faction Reckoning war tracker, and the skill training screen."
                width={1056}
                height={1036}
                caption="The screens players actually live in — combat, The Ward, the market, crime, Reckoning, and training."
              />
            </div>
          </section>
        </SectionReveal>

        {/* Design pillars */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Swords size={13} />} label="Design" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Four decisions the whole game hangs on
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
              {DESIGN_PILLARS.map((step) => (
                <div key={step.title} style={{ display: "flex", gap: "1.125rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: ACCENT_SOFT_BG,
                      border: `1px solid ${ACCENT_SOFT_BORDER}`,
                      color: ACCENT,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {step.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8", marginBottom: "0.4rem" }}>
                      {step.title}
                    </div>
                    <p style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.75, margin: 0, maxWidth: 780 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "2rem" }}>
              <Screenshot
                src="/images/projects/reactor48/03-living-world.png"
                alt="The Reactor 48 live world dashboard — counters for survivors stirred in the last hour, crimes pulled today, Grits in circulation, active Reckonings, bodies in The Ward, and tonight's radiation level."
                width={960}
                height={641}
                caption="Live world telemetry — every figure pulled from the running game."
              />
              <Screenshot
                src="/images/projects/reactor48/04-long-game.png"
                alt="The Reactor 48 long-game overview — four cards covering Factions, the five-skill system with permanent consequences, ten map regions, and the five-act Chronicle storyline."
                width={960}
                height={602}
                caption="The long game — factions, five skills, ten regions, and a five-act spine."
              />
            </div>
          </section>
        </SectionReveal>

        {/* What I built */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Cpu size={13} />} label="Solo build" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What I built
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: "0.75rem 2rem" }}>
              {project.highlights.map((h, idx) => (
                <li key={idx} style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.7 }}>
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </SectionReveal>

        {/* Tech stack */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<GitBranch size={13} />} label="Stack" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.5rem" }}>
              Tech
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "0.45rem 0.875rem",
                    background: "rgba(31,31,46,0.8)",
                    border: "1px solid #27273A",
                    borderRadius: 5,
                    fontSize: "0.75rem",
                    color: "#787F96",
                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* Cross-links */}
        <div
          style={{
            paddingTop: "2.5rem",
            borderTop: "1px solid #1F1F2E",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <Link
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.875rem",
              color: "#787F96",
              textDecoration: "none",
              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
            }}
          >
            <ArrowLeft size={14} /> All projects
          </Link>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <Link href="/projects/trnscode" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              TRNSCODE →
            </Link>
            <Link href="/projects/graffiti" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Graffiti →
            </Link>
            <Link href="/projects/floaudio" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              FloAud.io →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
