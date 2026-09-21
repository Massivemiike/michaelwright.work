// src/game/runtime/render/loadAtlas.ts
//
// Client-only, async, NON-blocking atlas loader shared by both renderer
// backends (spec §"Asset loading"). Fetches the JSON manifest + the PNG,
// decodes the PNG to an ImageBitmap, and returns both — or `null` on ANY
// failure (missing file / 404, malformed JSON, decode error, or a runtime
// without fetch/createImageBitmap). A null result is the signal to stay on the
// SDF fallback permanently; sprites are an enhancement layer, never a hard
// dependency ("never a blank board").
//
// Under src/game/runtime/render/** => outside the sim purity guard, so
// fetch/createImageBitmap/DOM are all fair game here. Nothing imports this at
// the top level of a marketing surface (it's reached only through a renderer,
// itself behind GameClient's dynamic import), so the lazy boundary + bundle
// budget are unaffected: the atlas PNG is a static file in public/, never
// bundled into JS.
import type { AtlasManifest } from "./atlas";

// Minimal shape guard so a JSON that parsed but isn't a manifest (wrong file,
// truncated write) is treated as a load failure rather than handed downstream
// as a half-valid manifest. hasFrame/frameUv already guard per-frame math, so
// this only needs the top-level fields.
function isManifest(v: unknown): v is AtlasManifest {
  if (v === null || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.width === "number" &&
    typeof m.height === "number" &&
    typeof m.frames === "object" &&
    m.frames !== null
  );
}

export async function loadAtlas(
  pngUrl: string,
  jsonUrl: string
): Promise<{ bitmap: ImageBitmap; manifest: AtlasManifest } | null> {
  try {
    const jsonRes = await fetch(jsonUrl);
    if (!jsonRes.ok) return null;
    const manifest: unknown = await jsonRes.json();
    if (!isManifest(manifest)) return null;

    const pngRes = await fetch(pngUrl);
    if (!pngRes.ok) return null;
    const blob = await pngRes.blob();
    const bitmap = await createImageBitmap(blob);

    return { bitmap, manifest };
  } catch {
    // Any failure (network, decode, no fetch/createImageBitmap in this env)
    // => null => SDF fallback stays in place. Deliberately quiet; the renderer
    // logs the "staying on SDF" decision once if it wants to.
    return null;
  }
}
