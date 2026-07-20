"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Menu, X, ChevronDown } from "lucide-react";

interface NavChild {
  href: string;
  label: string;
  hint?: string;
}

interface NavLink {
  href: string;
  label: string;
  children?: NavChild[];
}

const INTERNAL_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/resume", label: "Resume" },
  {
    href: "/projects",
    label: "Projects",
    children: [
      { href: "/projects", label: "All projects", hint: "Summary index" },
      { href: "/projects/trnscode", label: "TRNSCODE", hint: "On-prem M&E + VFX platform" },
      { href: "/projects/reactor48", label: "Reactor 48", hint: "Persistent post-nuclear MMO" },
      { href: "/projects/graffiti", label: "Graffiti", hint: "Local-first AI tagging" },
      { href: "/projects/floaudio", label: "FloAud.io", hint: "Browser audio platform" },
      { href: "/projects/rndrwork", label: "rndr.work", hint: "Cloud render farm" },
    ],
  },
  { href: "/blog", label: "Blog" },
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /* Close drawer + dropdown on route change */
  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [pathname]);

  /* Lock body scroll when drawer open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href.includes("#")) return false;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function isChildActive(child: NavChild) {
    return pathname === child.href;
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
          {INTERNAL_LINKS.map((item) => {
            const hasChildren = !!item.children?.length;
            const isOpen = hasChildren && openMenu === item.href;

            return (
              <li
                key={item.href}
                style={{ position: "relative" }}
                onMouseEnter={() => hasChildren && setOpenMenu(item.href)}
                onMouseLeave={() => hasChildren && setOpenMenu(null)}
                onFocus={() => hasChildren && setOpenMenu(item.href)}
                onBlur={(e) => {
                  if (hasChildren && !e.currentTarget.contains(e.relatedTarget as Node)) {
                    setOpenMenu(null);
                  }
                }}
              >
                <Link
                  href={item.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: isActive(item.href) ? "#F0F2F8" : "#787F96",
                    textDecoration: "none",
                    letterSpacing: "0.01em",
                    position: "relative",
                    paddingBottom: 3,
                    transition: "color 0.2s",
                  }}
                  aria-haspopup={hasChildren ? "menu" : undefined}
                  aria-expanded={hasChildren ? isOpen : undefined}
                >
                  {item.label}
                  {hasChildren && (
                    <ChevronDown
                      size={11}
                      style={{
                        transition: "transform 0.18s",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        opacity: 0.7,
                      }}
                    />
                  )}
                  {isActive(item.href) && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: -3,
                        left: 0,
                        right: hasChildren ? 16 : 0,
                        height: 2,
                        background: "#FF3B2F",
                        borderRadius: 1,
                      }}
                    />
                  )}
                </Link>

                {/* Dropdown panel */}
                {hasChildren && (
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        key="dropdown"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                        role="menu"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 14px)",
                          left: "50%",
                          transform: "translateX(-50%)",
                          minWidth: 260,
                          background: "rgba(10,10,16,0.97)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          border: "1px solid #1F1F2E",
                          borderRadius: 10,
                          padding: "0.5rem",
                          boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
                        }}
                      >
                        {/* Hover bridge so the gap doesn't close the menu */}
                        <div
                          style={{
                            position: "absolute",
                            top: -14,
                            left: 0,
                            right: 0,
                            height: 14,
                          }}
                          aria-hidden
                        />
                        {item.children!.map((child) => {
                          const active = isChildActive(child);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              role="menuitem"
                              style={{
                                display: "block",
                                padding: "0.625rem 0.875rem",
                                borderRadius: 6,
                                textDecoration: "none",
                                background: active ? "rgba(255,59,47,0.08)" : "transparent",
                                border: active ? "1px solid rgba(255,59,47,0.2)" : "1px solid transparent",
                                transition: "background 0.15s, border-color 0.15s",
                              }}
                            >
                              <div
                                style={{
                                  fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                                  fontWeight: 700,
                                  fontSize: "0.875rem",
                                  color: active ? "#FF3B2F" : "#F0F2F8",
                                  letterSpacing: "-0.005em",
                                }}
                              >
                                {child.label}
                              </div>
                              {child.hint && (
                                <div
                                  style={{
                                    fontSize: "0.6875rem",
                                    color: "#787F96",
                                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                                    letterSpacing: "0.04em",
                                    marginTop: 2,
                                  }}
                                >
                                  {child.hint}
                                </div>
                              )}
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
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
                maxHeight: "calc(100vh - 66px)",
                overflowY: "auto",
              }}
            >
              {INTERNAL_LINKS.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                >
                  <Link
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "0.875rem 0",
                      borderBottom: item.children ? "none" : "1px solid #1F1F2E",
                      fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                      fontWeight: 600,
                      fontSize: "1.125rem",
                      color: isActive(item.href) ? "#F0F2F8" : "#787F96",
                      textDecoration: "none",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {isActive(item.href) && (
                      <span style={{ color: "#FF3B2F", marginRight: "0.5rem" }}>—</span>
                    )}
                    {item.label}
                  </Link>
                  {item.children && (
                    <div
                      style={{
                        paddingLeft: "1.25rem",
                        paddingBottom: "0.75rem",
                        borderLeft: "1px solid #1F1F2E",
                        marginLeft: "0.5rem",
                        marginBottom: "0.5rem",
                        borderBottom: "1px solid #1F1F2E",
                      }}
                    >
                      {item.children.map((child) => {
                        const active = isChildActive(child);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            style={{
                              display: "block",
                              padding: "0.5rem 0",
                              fontSize: "0.9375rem",
                              fontWeight: 500,
                              color: active ? "#FF3B2F" : "#787F96",
                              textDecoration: "none",
                              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
                            }}
                          >
                            {child.label}
                            {child.hint && (
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.6875rem",
                                  color: "#3C3F52",
                                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                                  letterSpacing: "0.04em",
                                  marginTop: 1,
                                }}
                              >
                                {child.hint}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
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
