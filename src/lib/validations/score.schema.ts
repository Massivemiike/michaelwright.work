import { z } from "zod";

// Mirrors src/lib/validations/contact.schema.ts's shape/role. The wire
// format matches the SHIPPED sim, not the stale spec §8.1: seed is a number
// (int32 daily seed) and commands carry flat optional tower?/tile? (not a
// `payload: unknown`). Commands are capped at the §8.2 limit; tower/tile
// ranges are validated in the sim (applyCommand no-ops anything illegal).
export const commandSchema = z.object({
  tick: z.number().int().min(0),
  type: z.enum(["start", "place", "upgrade", "sell"]),
  tower: z.number().int().min(0).optional(),
  tile: z.number().int().min(0).optional(),
});

export const scoreSubmissionSchema = z.object({
  gameSlug: z.literal("circle-td"),
  simVersion: z.number().int(),
  seed: z.number().int(),
  mode: z.enum(["daily", "free"]),
  initials: z.string().regex(/^[A-Za-z]{3}$/, "Initials must be exactly 3 letters"),
  commands: z.array(commandSchema).max(20000),
});

export type ScoreSubmission = z.infer<typeof scoreSubmissionSchema>;
