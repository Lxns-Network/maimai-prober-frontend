import { describe, expect, it } from "vitest";
import { particleCameraError } from "./stageParticles";

const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
const camera = {
  view: identity,
  projection: identity,
  viewProjection: identity,
  position: [0, 0, 0],
};

describe("particle camera check", () => {
  it("accepts a finite camera", () => {
    expect(particleCameraError(camera)).toBeNull();
  });

  it("names a camera whose view or projection is not finite", () => {
    const view = identity.map(() => NaN);
    expect(particleCameraError({ ...camera, view })).toMatch(/not finite/);
    expect(particleCameraError({ ...camera, viewProjection: view })).toMatch(/not finite/);
  });
});
