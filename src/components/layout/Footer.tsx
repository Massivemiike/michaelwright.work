import Link from "next/link";

export default function Footer() {
  return (
    <footer
      style={{
        position: "relative",
        zIndex: 10,
        background: "rgba(8,8,12,0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid #1F1F2E",
        padding: "3rem",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: "2rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
              fontWeight: 800,
              fontSize: "1.125rem",
              color: "#F0F2F8",
              marginBottom: "0.75rem",
            }}
          >
            Michael Wright
          </div>
          <p style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.7, maxWidth: 260 }}>
            Cloud Infrastructure Architect · Systems Engineer · Engineering Leader
          </p>
        </div>

        <FooterCol label="Navigation">
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/resume">Resume</FooterLink>
          <FooterLink href="/blog">Blog</FooterLink>
          <FooterLink href="/gallery">Gallery</FooterLink>
          <FooterLink href="/contact">Contact</FooterLink>
        </FooterCol>

        <FooterCol label="Expertise">
          <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>AWS Architecture</span>
          <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>DevOps & CI/CD</span>
          <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>Platform Engineering</span>
          <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>Systems Reliability</span>
        </FooterCol>

        <FooterCol label="Connect">
          <a
            href="https://www.linkedin.com/in/macgyver2026"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.8125rem", color: "#787F96", textDecoration: "none" }}
          >
            LinkedIn ↗
          </a>
          <a
            href="https://www.linkedin.com/in/macgyver2026/recent-activity/articles/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.8125rem", color: "#787F96", textDecoration: "none" }}
          >
            LinkedIn Articles ↗
          </a>
          <a
            href="mailto:m.wright2@lafilm.edu"
            style={{ fontSize: "0.8125rem", color: "#787F96", textDecoration: "none" }}
          >
            m.wright2@lafilm.edu
          </a>
          <a
            href="mailto:michael.wright@gpltech.com"
            style={{ fontSize: "0.8125rem", color: "#787F96", textDecoration: "none" }}
          >
            michael.wright@gpltech.com
          </a>
        </FooterCol>
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          paddingTop: "1.5rem",
          borderTop: "1px solid #1F1F2E",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>
          © 2026 Michael Wright · Built with precision.
        </span>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {["in", "gh", "@"].map((icon) => (
            <div
              key={icon}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid #1F1F2E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.6875rem",
                color: "#3C3F52",
                fontFamily: "var(--font-mono-var, 'JetBrains Mono'), monospace",
              }}
            >
              {icon}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "#3C3F52",
          textTransform: "uppercase",
          marginBottom: "0.875rem",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ fontSize: "0.8125rem", color: "#787F96", textDecoration: "none" }}>
      {children}
    </Link>
  );
}
