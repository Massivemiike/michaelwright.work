"use client";

import { useEffect } from "react";
import { Settings, X } from "lucide-react";
import { useNodeNetwork } from "@/components/context/NodeNetworkContext";

export default function AdminPanel() {
  const { settings, updateSettings, resetSettings, panelOpen, setPanelOpen } =
    useNodeNetwork();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setPanelOpen(!panelOpen);
      }
      if (e.key === "Escape") setPanelOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        title="Background Settings (Ctrl+Shift+A)"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 200,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(15,15,21,0.85)",
          border: "1px solid #27273A",
          color: "#787F96",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(12px)",
          transition: "color 0.2s, border-color 0.2s",
        }}
      >
        <Settings size={18} />
      </button>

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 300,
          zIndex: 300,
          background: "rgba(10,10,16,0.95)",
          backdropFilter: "blur(24px)",
          borderLeft: "1px solid #1F1F2E",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          transform: panelOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
          fontFamily: "var(--font-body-var, 'Outfit'), sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontFamily: "var(--font-display-var, 'Syne'), sans-serif", fontSize: "0.9375rem", fontWeight: 700, color: "#F0F2F8" }}>
            Flow Settings
          </h3>
          <button
            onClick={() => setPanelOpen(false)}
            style={{ background: "none", border: "none", color: "#787F96", cursor: "pointer", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Effect toggle */}
        <ToggleRow
          label="Effect Enabled"
          checked={settings.enabled}
          onChange={(v) => updateSettings({ enabled: v })}
        />

        <SectionLabel>Speed</SectionLabel>

        <SliderRow
          label="Flow Speed"
          value={settings.flowSpeed * 1000}
          min={1} max={50}
          display={(v) => (v / 10).toFixed(1) + "×"}
          onChange={(v) => updateSettings({ flowSpeed: v / 1000 })}
        />

        <SliderRow
          label="Scroll Sensitivity"
          value={Math.round(settings.scrollSensitivity * 10000 * 1.8)}
          min={1} max={80}
          display={(v) => (v / 60).toFixed(2) + "×"}
          onChange={(v) => updateSettings({ scrollSensitivity: v / 10000 / 1.8 })}
        />

        <SliderRow
          label="Momentum Decay"
          value={settings.momentumDecay}
          min={20} max={800} step={10}
          display={(v) => v + "ms"}
          onChange={(v) => updateSettings({ momentumDecay: v })}
        />

        <SectionLabel>Pulses</SectionLabel>

        <ToggleRow
          label="Neuron Pulses"
          checked={settings.pulsesEnabled}
          onChange={(v) => updateSettings({ pulsesEnabled: v })}
        />

        <button
          onClick={resetSettings}
          style={{
            marginTop: "auto",
            padding: "0.5rem 1rem",
            background: "rgba(255,59,47,0.08)",
            border: "1px solid rgba(255,59,47,0.25)",
            borderRadius: 6,
            color: "#FF3B2F",
            fontSize: "0.8125rem",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Reset to Defaults
        </button>

        <p style={{ fontSize: "0.6875rem", color: "#3C3F52", textAlign: "center" }}>
          <kbd style={{ background: "#16161F", padding: "1px 4px", borderRadius: 3, border: "1px solid #27273A" }}>Ctrl</kbd>
          {" + "}
          <kbd style={{ background: "#16161F", padding: "1px 4px", borderRadius: 3, border: "1px solid #27273A" }}>Shift</kbd>
          {" + "}
          <kbd style={{ background: "#16161F", padding: "1px 4px", borderRadius: 3, border: "1px solid #27273A" }}>A</kbd>
          {" to toggle"}
        </p>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", color: "#3C3F52", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: checked ? "#FF3B2F" : "#1F1F2E",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#F0F2F8",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step = 1, display, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
        <span style={{ color: "#787F96" }}>{label}</span>
        <span style={{ color: "#F0F2F8", fontFamily: "var(--font-mono-var, 'JetBrains Mono'), monospace", fontSize: "0.75rem" }}>
          {display(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#FF3B2F", cursor: "pointer" }}
      />
    </div>
  );
}
