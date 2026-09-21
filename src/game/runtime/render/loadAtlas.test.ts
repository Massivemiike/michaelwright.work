import { describe, it, expect } from "vitest";
import { loadAtlas } from "./loadAtlas";

// loadAtlas is client-only (fetch + createImageBitmap). Its whole contract for
// the renderers is "return null on ANY failure so the SDF fallback stays" —
// that's the one branch worth pinning in a node unit test. A bare relative
// path can't be fetched here (no server / unparseable URL), so this exercises
// the try/catch => null path that both backends gate their sprite drawing on.
describe("loadAtlas", () => {
  it("resolves to null when the assets can't be fetched (=> SDF fallback stays)", async () => {
    const res = await loadAtlas("/games/circle-td/sprites/atlas.png", "/games/circle-td/sprites/atlas.json");
    expect(res).toBeNull();
  });

  it("never throws, even for a wholly bogus url pair", async () => {
    await expect(loadAtlas("::::", "::::")).resolves.toBeNull();
  });
});
