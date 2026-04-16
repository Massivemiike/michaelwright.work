import type { Metadata } from "next";
import { Mail, MapPin, Clock, ExternalLink } from "lucide-react";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Michael Wright — Cloud Infrastructure Architect & DevOps Engineer.",
};

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Header */}
      <div style={{ background: "rgba(8,8,12,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1F1F2E", padding: "3rem 4rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.18em", color: "#FF3B2F", textTransform: "uppercase", marginBottom: "0.75rem", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
            Contact
          </div>
          <h1 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(2rem,4vw,3rem)", color: "#F0F2F8", marginBottom: "0.5rem" }}>
            Get in touch
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 520 }}>
            Whether you need cloud infrastructure expertise, have a DevOps challenge, or want to talk about FloAud.io — I'm happy to connect.
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "4rem", display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "5rem", alignItems: "start" }}>

        {/* Left — contact info */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "2.5rem" }}>
            {[
              { icon: <Mail size={18} />, label: "Email", value: "michael.wright@gpltech.com", href: "mailto:michael.wright@gpltech.com" },
              { icon: <MapPin size={18} />, label: "Location", value: "Los Angeles, CA · Remote" },
              { icon: <Clock size={18} />, label: "Response time", value: "Within 24 hours" },
            ].map(({ icon, label, value, href }) => (
              <div key={label} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,59,47,0.08)", border: "1px solid rgba(255,59,47,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF3B2F", flexShrink: 0 }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.2rem" }}>{label}</div>
                  {href ? (
                    <a href={href} style={{ fontSize: "0.9375rem", color: "#F0F2F8", textDecoration: "none" }}>{value}</a>
                  ) : (
                    <span style={{ fontSize: "0.9375rem", color: "#F0F2F8" }}>{value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#1F1F2E", marginBottom: "2rem" }} />

          {/* Social links */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
              Connect
            </div>
            {[
              { label: "LinkedIn", href: "https://www.linkedin.com/in/macgyver2026" },
              { label: "LinkedIn Articles", href: "https://www.linkedin.com/in/macgyver2026/recent-activity/articles/" },
              { label: "FloAud.io", href: "https://floaud.io" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.9375rem", color: "#787F96", textDecoration: "none", transition: "color 0.2s" }}
              >
                {label} <ExternalLink size={12} />
              </a>
            ))}
          </div>

          {/* Availability card */}
          <div style={{ marginTop: "2.5rem", padding: "1.25rem 1.5rem", background: "rgba(15,15,21,0.9)", border: "1px solid #1F1F2E", borderTop: "1px solid rgba(127,219,255,0.2)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7FDBFF", boxShadow: "0 0 6px rgba(127,219,255,0.6)" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#7FDBFF", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>Available</span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.6, margin: 0 }}>
              Open to consulting engagements, cloud architecture advisory, and strategic DevOps work.
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
