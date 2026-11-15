import { describe, expect, it, vi } from "vitest";
import {
  createEffectSlot,
  type EffectHost,
} from "../src/pages/public/Chart/chunithm/rendering/effects";
function frameInput() {
  const projection = [1.5, 0, 0, 0, 0, 2.4, 0, 0, 0, 0, 1.0002, 1, 0, 0, -0.20002, 0].map(
    Math.fround,
  );
  const view = [1, 0, 0, 0, 0, 0.8, -0.6, 0, 0, 0.6, 0.8, 0, 0, -72, -1.4, 1].map(Math.fround);
  return {
    speedRow: 0,
    judgePositionOffset: 0,
    criticalDisplayRow: 0,
    camera: {
      viewport: { width: 1280, height: 720 },
      cameraA: view,
      cameraB: projection,
      viewProjection: new Float32Array(16).fill(0.5),
    },
    environment: { fpcw: 0x027f, mxcsr: 0x1f80 },
  };
}
describe("engine effect slot", () => {
  const entry = {
    pass: 16,
    key: 0x8000,
    depth: 0.5,
    requiresDepthSnapshot: false,
    draw: () => ({ draws: 1 }),
  };
  const input = { ...frameInput(), seconds: 1, effects: {} as never };
  const fakeHost = () =>
    ({ draws: vi.fn(() => [entry]), dispose: vi.fn() }) as unknown as EffectHost & {
      draws: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    };
  const deferred = () => {
    let settle!: {
      resolve(host: EffectHost): void;
      reject(error: Error): void;
    };
    const promise = new Promise<EffectHost>((resolve, reject) => (settle = { resolve, reject }));
    return { promise, settle };
  };
  it("reports the effects as loading until the host arrives", () => {
    const slot = createEffectSlot(deferred().promise);
    expect(slot.frame(input)).toEqual([]);
  });
  it("draws through the host once it arrives and asks for a frame", async () => {
    const { promise, settle } = deferred();
    const onChange = vi.fn();
    const slot = createEffectSlot(promise, onChange);
    const host = fakeHost();
    settle.resolve(host);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(slot.frame(input)).toEqual([entry]);
    expect(host.draws).toHaveBeenCalledWith(input);
  });
  it("reports effects that cannot be loaded", async () => {
    const { promise, settle } = deferred();
    const onChange = vi.fn();
    const slot = createEffectSlot(promise, onChange);
    const failure = new Error("Effect texture 23:0 HTTP 404");
    settle.reject(failure);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(() => slot.frame(input)).toThrow(failure);
  });
  it("releases a host that arrives after disposal", async () => {
    const { promise, settle } = deferred();
    const onChange = vi.fn();
    const slot = createEffectSlot(promise, onChange);
    slot.dispose();
    const host = fakeHost();
    settle.resolve(host);
    await vi.waitFor(() => expect(host.dispose).toHaveBeenCalledOnce());
    expect(onChange).not.toHaveBeenCalled();
  });
  it("releases its host on disposal", async () => {
    const { promise, settle } = deferred();
    const onChange = vi.fn();
    const slot = createEffectSlot(promise, onChange);
    const host = fakeHost();
    settle.resolve(host);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    slot.dispose();
    expect(host.dispose).toHaveBeenCalledOnce();
  });
});
