import { describe, it, expect } from "vitest";
import { dailySeed, utcDateString, acceptableDailySeeds } from "./dailySeed";

describe("dailySeed", () => {
  it("is stable for a fixed UTC day and differs across days", () => {
    const a = new Date("2026-09-18T10:00:00Z");
    const b = new Date("2026-09-18T23:59:00Z");
    const c = new Date("2026-09-19T00:00:00Z");
    expect(dailySeed(a)).toBe(dailySeed(b));
    expect(dailySeed(a)).not.toBe(dailySeed(c));
    expect(utcDateString(a)).toBe("2026-09-18");
  });
});

describe("acceptableDailySeeds", () => {
  it("returns only today's seed outside the grace window", () => {
    const noon = new Date("2026-09-19T12:00:00Z");
    expect(acceptableDailySeeds(noon, 10)).toEqual([dailySeed(noon)]);
  });
  it("also accepts yesterday's seed within the post-midnight grace window", () => {
    const justAfterMidnight = new Date("2026-09-19T00:05:00Z");
    const yesterday = new Date("2026-09-18T00:05:00Z");
    const seeds = acceptableDailySeeds(justAfterMidnight, 10);
    expect(seeds).toContain(dailySeed(justAfterMidnight));
    expect(seeds).toContain(dailySeed(yesterday));
    expect(seeds).toHaveLength(2);
  });
});
