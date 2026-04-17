"use client";

import { useEffect, useRef } from "react";
import { useNodeNetwork } from "@/components/context/NodeNetworkContext";

interface Node {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  pulsePhase: number;
  pulseRate: number;
}

interface Pulse {
  from: number;
  to: number;
  t: number;
  duration: number;
}

function hexToRgb(h: string) {
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export default function NodeNetworkCanvas() {
  const { settings } = useNodeNetwork();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  const stateRef = useRef({
    nodes: [] as Node[],
    pulses: [] as Pulse[],
    scrollBoost: 0,
    lastTime: 0,
    rafId: 0,
  });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const state = stateRef.current;

    function makeNode(randomY: boolean): Node {
      const s = settingsRef.current;
      return {
        x: Math.random() * canvas!.width,
        y: randomY ? Math.random() * canvas!.height : -8,
        vy: s.flowSpeed * (0.75 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 0.001,
        size: s.nodeSize * (0.7 + Math.random() * 0.6),
        pulsePhase: Math.random() * Math.PI * 2,
        pulseRate: 0.0006 + Math.random() * 0.0006,
      };
    }

    function initNodes() {
      state.nodes = Array.from({ length: settingsRef.current.nodeCount }, () => makeNode(true));
      state.pulses = [];
    }

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      initNodes();
    }

    function animate(ts: number) {
      state.rafId = requestAnimationFrame(animate);
      const s = settingsRef.current;
      const dt = Math.min(ts - (state.lastTime || ts), 50);
      state.lastTime = ts;

      if (!s.enabled) {
        ctx.clearRect(0, 0, canvas!.width, canvas!.height);
        return;
      }

      const decayFactor = 1 - Math.exp(-dt / s.momentumDecay);
      state.scrollBoost *= 1 - decayFactor;

      const totalVy = s.flowSpeed + state.scrollBoost;
      const { r, g, b } = hexToRgb(s.nodeColor);

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      for (const node of state.nodes) {
        node.y += totalVy * dt;
        node.x += node.vx * dt;
        if (node.x < 0) { node.x = 0; node.vx *= -1; }
        if (node.x > canvas!.width) { node.x = canvas!.width; node.vx *= -1; }
        if (node.y > canvas!.height + 20) {
          node.y = -10 - Math.random() * 40;
          node.x = Math.random() * canvas!.width;
          node.vy = s.flowSpeed * (0.75 + Math.random() * 0.5);
        }
      }

      const activeConnections: { i: number; j: number; dist: number }[] = [];

      for (let i = 0; i < state.nodes.length; i++) {
        for (let j = i + 1; j < state.nodes.length; j++) {
          const dx = state.nodes[i].x - state.nodes[j].x;
          const dy = state.nodes[i].y - state.nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < s.connectionDistance) {
            const proximity = 1 - dist / s.connectionDistance;
            const fireFactor = dist < s.connectionDistance * 0.35 ? 1.5 : 1.0;
            const lineAlpha = s.lineOpacity * proximity * fireFactor;
            ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(lineAlpha, 0.65).toFixed(3)})`;
            ctx.lineWidth = 0.5 + proximity * 0.4;
            ctx.beginPath();
            ctx.moveTo(state.nodes[i].x, state.nodes[i].y);
            ctx.lineTo(state.nodes[j].x, state.nodes[j].y);
            ctx.stroke();
            activeConnections.push({ i, j, dist });
          }
        }
      }

      if (s.pulsesEnabled && activeConnections.length > 0) {
        const spawnChance = 0.00018 * dt;
        for (const conn of activeConnections) {
          if (Math.random() < spawnChance) {
            const forward = Math.random() > 0.5;
            state.pulses.push({
              from: forward ? conn.i : conn.j,
              to: forward ? conn.j : conn.i,
              t: 0,
              duration: 450 + Math.random() * 300,
            });
            if (state.pulses.length > 40) state.pulses.shift();
          }
        }
      }

      const alivePulses: Pulse[] = [];
      for (const pulse of state.pulses) {
        pulse.t += dt / pulse.duration;
        if (pulse.t >= 1) continue;
        const na = state.nodes[pulse.from];
        const nb = state.nodes[pulse.to];
        if (!na || !nb) continue;
        const dist = Math.hypot(na.x - nb.x, na.y - nb.y);
        if (dist >= s.connectionDistance) continue;
        const eased =
          pulse.t < 0.5
            ? 2 * pulse.t * pulse.t
            : 1 - Math.pow(-2 * pulse.t + 2, 2) / 2;
        const px = na.x + (nb.x - na.x) * eased;
        const py = na.y + (nb.y - na.y) * eased;
        const pAlpha = Math.sin(pulse.t * Math.PI) * 0.9;
        ctx.shadowColor = `rgba(${r},${g},${b},${pAlpha.toFixed(2)})`;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(${r},${g},${b},${pAlpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        alivePulses.push(pulse);
      }
      state.pulses = alivePulses;

      for (const node of state.nodes) {
        const pulse = 1 + Math.sin(ts * node.pulseRate + node.pulsePhase) * 0.1;
        const alpha = s.nodeOpacity * pulse;
        ctx.shadowColor = `rgba(${r},${g},${b},0.3)`;
        ctx.shadowBlur = 5;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    function onWheel(e: WheelEvent) {
      const s = settingsRef.current;
      state.scrollBoost += e.deltaY * s.scrollSensitivity;
      const maxBoost = s.flowSpeed * 20;
      state.scrollBoost = Math.max(
        -s.flowSpeed * 5,
        Math.min(state.scrollBoost, maxBoost)
      );
    }

    let resizeTimer: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }

    resize();
    state.rafId = requestAnimationFrame(animate);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(state.rafId);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
