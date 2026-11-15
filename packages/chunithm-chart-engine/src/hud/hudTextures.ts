import { throwIfAborted } from "../assets/abort";
import type { HudScene } from "./hudScene";
import type { HudTextureImage } from "./hudRenderer";

/**
 * Loads every texture the scene samples, in scene order: published images relative to the
 * interface manifest, decoded without premultiplying or color conversion, and packed pixels from
 * the scene itself. The jacket slot takes the chart's own jacket, or stays empty without one.
 */
export async function loadHudTextureImages(
  scene: HudScene,
  manifestUrl: string,
  jacket: HudTextureImage | null,
  signal: AbortSignal,
): Promise<(HudTextureImage | null)[]> {
  const decoded = await Promise.allSettled(
    scene.meta.textures.map(async (texture): Promise<HudTextureImage | null> => {
      const source = texture.source;
      if (source.kind === "jacket") return jacket;
      if (source.kind === "packed")
        return {
          width: texture.width,
          height: texture.height,
          pixels: scene.bytes.subarray(source.offset, source.offset + source.length),
        };
      let blob: Blob;
      if (source.kind === "encoded") {
        if (
          source.offset < 0 ||
          source.length <= 0 ||
          source.offset + source.length > scene.bytes.length
        )
          throw new RangeError(`Interface texture ${texture.id} is outside the scene`);
        blob = new Blob([scene.bytes.slice(source.offset, source.offset + source.length).buffer]);
      } else {
        const response = await fetch(new URL(source.url, manifestUrl), {
          signal,
          credentials: "omit",
        });
        if (!response.ok)
          throw new Error(`Interface texture ${texture.id} HTTP ${response.status}`);
        blob = await response.blob();
      }
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "none",
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      if (bitmap.width !== texture.width || bitmap.height !== texture.height) {
        bitmap.close();
        throw new RangeError(`Interface texture ${texture.id} has unexpected dimensions`);
      }
      return bitmap;
    }),
  );
  const failed = decoded.find((result) => result.status === "rejected");
  if (failed || signal.aborted) {
    for (const result of decoded)
      if (
        result.status === "fulfilled" &&
        result.value !== jacket &&
        result.value instanceof ImageBitmap
      )
        result.value.close();
    if (failed) throw failed.reason;
    throwIfAborted(signal);
  }
  return decoded.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}
