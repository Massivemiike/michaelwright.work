"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";

const INTERNAL_LINKS = [
  { href: "/", label: "Home" },
  { href: "/resume", label: "Resume" },
  { href: "/blog", label: "Blog" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

const EXTERNAL_LINKS = [
  { href: "https://www.linkedin.com/in/macgyver2026", label: "LinkedIn" },
  { href: "https://www.linkedin.com/in/macgyver2026/recent-activity/articles/", label: "Articles" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 66,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 3rem",
        background: "rgba(8,8,12,0.78)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid #1F1F2E",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.875rem", textDecoration: "none" }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: "rgba(255,59,47,0.09)",
            border: "1px solid rgba(255,59,47,0.3)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
            fontWeight: 800,
            fontSize: "0.875rem",
            color: "#FF3B2F",
          }}
        >
          MW
        </div>
        <span
          style={{
            fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
            fontWeight: 700,
            fontSize: "1rem",
            letterSpacing: "-0.01em",
            color: "#F0F2F8",
          }}
        >
          Michael Wright
        </span>
      </Link>

      <ul style={{ display: "flex", alignItems: "center", gap: "2.25rem", listStyle: "none", margin: 0, padding: 0 }}>
        {INTERNAL_LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: active ? "#F0F2F8" : "#787F96",
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  position: "relative",
                  paddingBottom: 3,
                  transition: "color 0.2s",
                }}
              >
                {label}
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -3,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "#FF3B2F",
                      borderRadius: 1,
                    }}
                  />
                )}
              </Link>
            </li>
          );
        })}
        {EXTERNAL_LINKS.map(({ href, label }) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "#787F96",
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "color 0.2s",
              }}
            >
              {label}
              <ExternalLink size={11} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
