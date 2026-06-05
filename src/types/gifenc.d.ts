declare module "gifenc" {
  export type GifPalette = Array<[number, number, number] | [number, number, number, number]>;

  export type GifEncoder = {
    finish(): void;
    bytes(): Uint8Array;
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        delay?: number;
        palette?: GifPalette;
        repeat?: number;
      },
    ): void;
  };

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444" },
  ): GifPalette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
  ): Uint8Array;
}
