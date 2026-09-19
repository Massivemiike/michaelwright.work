// src/data/games.data.ts
//
// The arcade catalog. Mirrors src/data/projects.data.ts's role: a plain
// data file with no side effects, imported by the arcade index
// (src/app/games/page.tsx) and by src/app/sitemap.ts. Adding a second
// title later means adding one entry here — the index page and the
// sitemap both update automatically (see games.filter/.map in each).
export interface Game {
  slug: string;
  name: string;
  blurb: string;
  status: "playable" | "soon";
  tags: string[];
}

export const games: Game[] = [
  {
    slug: "circle-td",
    name: "Circle TD",
    blurb:
      "A from-scratch recreation of David Scott's 2007 Flash tower-defense original. There are no exits and no lives — creeps that survive a lap keep looping, and the run ends the moment the population overruns you. Deterministic simulation, a new seed every day.",
    status: "playable",
    tags: ["Tower Defense", "Canvas2D", "Deterministic Sim", "Daily Seed"],
  },
];
