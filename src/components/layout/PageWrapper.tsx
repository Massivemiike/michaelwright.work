"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";

// Task 8: the game route's canvas sizes itself off a ResizeObserver on
// its container (see GameClient.tsx's observeResize) the moment it
// mounts — running that measurement while the container is still mid
// fade/translate (this wrapper's one-time entry animation) is one more
// moving part during the canvas's first paint that the route doesn't
// need. Skipping it here is a single string compare, so it's worth
// doing; every other route keeps the fade unchanged.
const NO_FADE_ROUTES = new Set(["/games/circle-td"]);

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (NO_FADE_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
