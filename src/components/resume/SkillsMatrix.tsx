"use client";

import { motion } from "motion/react";
import { useInView } from "motion/react";
import { useRef } from "react";
import type { Skill } from "@/data/resume.data";

export default function SkillsMatrix({ skills }: { skills: Skill[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {skills.map((group) => (
        <div key={group.category}>
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: "#3C3F52",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              marginBottom: "0.875rem",
            }}
          >
            {group.category}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {group.items.map((skill) => (
              <SkillBar key={skill.name} name={skill.name} level={skill.level} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillBar({ name, level }: { name: string; level: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.3rem",
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>{name}</span>
        <span
          style={{
            fontSize: "0.6875rem",
            color: "#3C3F52",
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
          }}
        >
          {level}%
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "#1F1F2E",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${level}%` } : { width: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{
            height: "100%",
            background: `linear-gradient(to right, #FF3B2F, ${level > 85 ? "#FF5045" : "#C42B20"})`,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
