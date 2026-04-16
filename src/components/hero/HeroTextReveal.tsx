"use client";

import { motion } from "motion/react";

interface HeroTextRevealProps {
  lines: string[];
  isActive: boolean;
}

export default function HeroTextReveal({ lines, isActive }: HeroTextRevealProps) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display-var,'Syne'),sans-serif",
        lineHeight: 1.05,
        marginBottom: "1.5rem",
      }}
    >
      {lines.map((line, li) => {
        const words = line.split(" ");
        const isFirst = li === 0;
        return (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", gap: "0 0.35em" }}>
            {words.map((w, wi) => (
              <span
                key={wi}
                style={{ overflow: "hidden", display: "inline-block", lineHeight: 1.1 }}
              >
                <motion.span
                  initial={{ y: "110%", opacity: 0, filter: "blur(4px)" }}
                  animate={
                    isActive
                      ? { y: "0%", opacity: 1, filter: "blur(0px)" }
                      : { y: "110%", opacity: 0, filter: "blur(4px)" }
                  }
                  transition={{
                    duration: 0.55,
                    ease: "easeOut",
                    delay: isActive ? 0.15 + (li * words.length + wi) * 0.07 : 0,
                  }}
                  style={{
                    display: "inline-block",
                    fontWeight: isFirst ? 300 : 800,
                    fontSize: isFirst
                      ? "clamp(1.75rem,3.5vw,3rem)"
                      : "clamp(3rem,6.5vw,6rem)",
                    color: li === lines.length - 1 ? "#FF3B2F" : "#F0F2F8",
                    textTransform: isFirst ? "none" : "uppercase",
                    letterSpacing: isFirst ? "normal" : "-0.02em",
                  }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
