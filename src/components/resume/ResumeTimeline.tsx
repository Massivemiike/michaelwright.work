"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import type { TimelineEntry } from "@/data/resume.data";

export default function ResumeTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [expanded, setExpanded] = useState<string>(entries[0]?.id ?? "");

  return (
    <div style={{ position: "relative" }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: 19,
          top: 8,
          bottom: 8,
          width: 1,
          background: "linear-gradient(to bottom, #FF3B2F, #1F1F2E 90%)",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {entries.map((entry, i) => {
          const isOpen = expanded === entry.id;
          return (
            <SectionReveal key={entry.id} delay={i * 0.08}>
              <div style={{ paddingLeft: "3rem", position: "relative" }}>
                {/* Dot */}
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    top: 20,
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: entry.current ? "#FF3B2F" : "#1F1F2E",
                    border: `2px solid ${entry.current ? "#FF3B2F" : "#27273A"}`,
                    boxShadow: entry.current ? "0 0 12px rgba(255,59,47,0.5)" : "none",
                    zIndex: 1,
                  }}
                />

                {/* Card */}
                <div
                  style={{
                    background: "rgba(15,15,21,0.9)",
                    border: `1px solid ${isOpen ? "#27273A" : "#1F1F2E"}`,
                    borderRadius: 10,
                    overflow: "hidden",
                    transition: "border-color 0.2s",
                  }}
                >
                  {/* Header — always visible */}
                  <button
                    onClick={() => setExpanded(isOpen ? "" : entry.id)}
                    style={{
                      width: "100%",
                      padding: "1.25rem 1.5rem",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      textAlign: "left",
                    }}
                  >
                    {/* Logo initials */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        background: entry.current ? "rgba(255,59,47,0.1)" : "rgba(31,31,46,0.8)",
                        border: `1px solid ${entry.current ? "rgba(255,59,47,0.3)" : "#27273A"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                        fontWeight: 700,
                        fontSize: "0.6875rem",
                        color: entry.current ? "#FF3B2F" : "#3C3F52",
                        flexShrink: 0,
                      }}
                    >
                      {entry.logoInitials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.625rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                            fontWeight: 700,
                            fontSize: "1rem",
                            color: "#F0F2F8",
                          }}
                        >
                          {entry.role}
                        </span>
                        {entry.current && (
                          <span
                            style={{
                              fontSize: "0.625rem",
                              fontWeight: 600,
                              letterSpacing: "0.1em",
                              color: "#FF3B2F",
                              textTransform: "uppercase",
                              background: "rgba(255,59,47,0.1)",
                              padding: "2px 6px",
                              borderRadius: 3,
                              border: "1px solid rgba(255,59,47,0.2)",
                            }}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "1rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>{entry.company}</span>
                        <span style={{ fontSize: "0.8125rem", color: "#3C3F52" }}>·</span>
                        <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>{entry.period}</span>
                        <span style={{ fontSize: "0.8125rem", color: "#3C3F52" }}>·</span>
                        <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>{entry.location}</span>
                      </div>
                    </div>

                    <ChevronDown
                      size={16}
                      style={{
                        color: "#3C3F52",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                        transition: "transform 0.25s",
                        flexShrink: 0,
                      }}
                    />
                  </button>

                  {/* Expandable body */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          style={{
                            padding: "0 1.5rem 1.5rem",
                            borderTop: "1px solid #1F1F2E",
                          }}
                        >
                          {/* Bullets */}
                          <ul
                            style={{
                              margin: "1.25rem 0",
                              paddingLeft: "1.25rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.625rem",
                            }}
                          >
                            {entry.bullets.map((b, bi) => (
                              <li
                                key={bi}
                                style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.7 }}
                              >
                                {b}
                              </li>
                            ))}
                          </ul>

                          {/* Tech tags */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                            {entry.technologies.map((t) => (
                              <span
                                key={t}
                                style={{
                                  padding: "0.25rem 0.625rem",
                                  background: "rgba(31,31,46,0.8)",
                                  border: "1px solid #27273A",
                                  borderRadius: 4,
                                  fontSize: "0.6875rem",
                                  color: "#3C3F52",
                                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </SectionReveal>
          );
        })}
      </div>
    </div>
  );
}
