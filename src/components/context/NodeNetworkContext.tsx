"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface NodeNetworkSettings {
  enabled: boolean;
  nodeCount: number;
  connectionDistance: number;
  nodeOpacity: number;
  lineOpacity: number;
  nodeSize: number;
  flowSpeed: number;
  scrollSensitivity: number;
  momentumDecay: number;
  nodeColor: string;
  pulsesEnabled: boolean;
}

const STORAGE_KEY = "mw-node-network-v2";

export const DEFAULTS: NodeNetworkSettings = {
  enabled: true,
  nodeCount: 55,
  connectionDistance: 350,
  nodeOpacity: 0.45,
  lineOpacity: 0.25,
  nodeSize: 3.0,
  flowSpeed: 0.01,
  scrollSensitivity: 0.0003,
  momentumDecay: 50,
  nodeColor: "#F0F2F8",
  pulsesEnabled: true,
};

interface NodeNetworkContextValue {
  settings: NodeNetworkSettings;
  updateSettings: (patch: Partial<NodeNetworkSettings>) => void;
  resetSettings: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  // Task 8 (games/circle-td): a TRANSIENT suspend flag for
  // NodeNetworkCanvas, deliberately separate from `settings.enabled` —
  // `settings` persists to localStorage (it's the visitor's own saved
  // background-effect preference), but suspending the background canvas
  // while a game is mounted (so it isn't fighting the game's own canvas
  // for GPU/pointer) is a per-session mechanical fact, not a preference.
  // It must never be written to localStorage or restored on reload, and
  // must reset the instant nothing needs it anymore (unmounting the game
  // client resets it), which is exactly what plain `useState` (vs.
  // `settings`'s localStorage-backed `updateSettings`) gives for free.
  suspended: boolean;
  setSuspended: (suspended: boolean) => void;
}

const NodeNetworkContext = createContext<NodeNetworkContextValue | null>(null);

export function NodeNetworkProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NodeNetworkSettings>(DEFAULTS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch {}
  }, []);

  function updateSettings(patch: Partial<NodeNetworkSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function resetSettings() {
    setSettings(DEFAULTS);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS)); } catch {}
  }

  return (
    <NodeNetworkContext.Provider
      value={{ settings, updateSettings, resetSettings, panelOpen, setPanelOpen, suspended, setSuspended }}
    >
      {children}
    </NodeNetworkContext.Provider>
  );
}

export function useNodeNetwork() {
  const ctx = useContext(NodeNetworkContext);
  if (!ctx) throw new Error("useNodeNetwork must be used inside NodeNetworkProvider");
  return ctx;
}
