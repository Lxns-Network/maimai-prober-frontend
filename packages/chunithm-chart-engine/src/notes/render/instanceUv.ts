const f = Math.fround;

/**
 * Rounds a UV transform `[offsetU, offsetV, scaleU, scaleV]`, in place, to the value a shader reads
 * when the transform travels in an instance's byte colour. Each component is scaled by 254 (the two
 * offsets also biased by 65535), truncated, reduced modulo 255 and clamped to a byte, and the byte is
 * read back as `byte / 255`. A component that does not truncate to an int32 reads back as 0.
 */
export function instanceUvBytes(values: Float32Array): void {
  for (let i = 0; i < 4; i++) {
    const scaled = f(values[i] * 254);
    const biased = i < 2 ? f(scaled + 65535) : scaled;
    const truncated =
      Number.isFinite(biased) && biased >= -2147483648 && biased < 2147483648
        ? Math.trunc(biased)
        : -2147483648;
    values[i] = f(Math.max(0, Math.min(255, truncated % 255)) / 255);
  }
}
