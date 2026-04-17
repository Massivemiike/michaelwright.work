"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Menu, X } from "lucide-react";

const INTERNAL_LINKS = [
  { href: "/", label: "Home" },
  { href: "/resume", label: "Resume" },
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Blog" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

const EXTERNAL_LINKS = [
  { href: "https://www.linkedin.com/in/macgyver2026", label: "LinkedIn" },
  {
    href: "https://www.linkedin.com/in/macgyver2026/recent-activity/articles/",
    label: "Articles",
  },
];

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Close drawer on route change */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* Lock body scroll when drawer open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
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
          padding: "0 2rem",
          background: "rgba(8,8,12,0.82)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid #1F1F2E",
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", textDecoration: "none" }}
        >
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
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 800,
              fontSize: "0.875rem",
              color: "#FF3B2F",
              flexShrink: 0,
            }}
          >
            MW
          </div>
          <span
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: "-0.01em",
              color: "#F0F2F8",
            }}
          >
            Michael Wright
          </span>
        </Link>

        {/* Desktop links */}
        <ul
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2rem",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
          className="nav-desktop-links"
        >
          {INTERNAL_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: isActive(href) ? "#F0F2F8" : "#787F96",
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  position: "relative",
                  paddingBottom: 3,
                  transition: "color 0.2s",
                }}
              >
                {label}
                {isActive(href) && (
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
          ))}
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
                  transition: "color 0.2s",
                }}
              >
                {label}
                <ExternalLink size={11} />
              </a>
            </li>
          ))}
        </ul>

        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="nav-hamburger"
          style={{
            display: "none",
            background: "none",
            border: "none",
            color: "#787F96",
            cursor: "pointer",
            padding: 6,
          }}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 98,
                background: "rgba(8,8,12,0.6)",
                backdropFilter: "blur(4px)",
              }}
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: "fixed",
                top: 66,
                left: 0,
                right: 0,
                zIndex: 99,
                background: "rgba(10,10,16,0.97)",
                backdropFilter: "blur(24px)",
                borderBottom: "1px solid #1F1F2E",
                padding: "1.5rem 2rem 2rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {INTERNAL_LINKS.map(({ href, label }, i) => (
                <motion.div
                  key={href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                >
                  <Link
                    href={href}
                    style={{
                      display: "block",
                      padding: "0.875rem 0",
                      borderBottom: "1px solid #1F1F2E",
                      fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                      fontWeight: 600,
                      fontSize: "1.125rem",
                      color: isActive(href) ? "#F0F2F8" : "#787F96",
                      textDecoration: "none",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {isActive(href) && (
                      <span style={{ color: "#FF3B2F", marginRight: "0.5rem" }}>—</span>
                    )}
                    {label}
                  </Link>
                </motion.div>
              ))}

              <div style={{ marginTop: "1rem", display: "flex", gap: "1.25rem" }}>
                {EXTERNAL_LINKS.map(({ href, label }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.8125rem",
                      color: "#787F96",
                      textDecoration: "none",
                    }}
                  >
                    {label} <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Responsive style */}
      <style>{`
        @media (max-width: 768px) {
          .nav-desktop-links { display: none !important; }
          .nav-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}
