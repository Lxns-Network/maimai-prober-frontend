import { describe, expect, it, vi } from "vitest";
import { createFrameHost } from "./frameHost";
import { createDepthSnapshot } from "../gpu/depthSnapshot";
import type { FrameDraw, FrameHostOptions } from "./frameTypes";

const K = {
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x100,
  STENCIL_BUFFER_BIT: 0x400,
  SCISSOR_TEST: 0x0c11,
  FRAMEBUFFER: 0x8d40,
  READ_FRAMEBUFFER: 0x8ca8,
  DRAW_FRAMEBUFFER: 0x8ca9,
  READ_FRAMEBUFFER_BINDING: 0x8caa,
  DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
  TEXTURE_BINDING_2D: 0x8069,
  TEXTURE_2D: 0x0de1,
  TEXTURE_BASE_LEVEL: 0x813c,
  TEXTURE_MAX_LEVEL: 0x813d,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  REPEAT: 0x2901,
  LINEAR: 0x2601,
  NEAREST: 0x2600,
  DEPTH_BITS: 0x0d56,
  STENCIL_BITS: 0x0d57,
  DEPTH24_STENCIL8: 0x88f0,
  DEPTH_STENCIL: 0x84f9,
  UNSIGNED_INT_24_8: 0x84fa,
  DEPTH_STENCIL_ATTACHMENT: 0x821a,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  NONE: 0,
};

interface Recorder {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly log: string[];
  readonly scissorEnabled: () => boolean;
}

function recorder(width: number, height: number): Recorder {
  const log: string[] = [];
  const bound = { read: null as unknown, draw: null as unknown, texture: null as unknown };
  let scissor = false;
  let ids = 0;
  const label = (value: unknown) =>
    typeof value === "object" && value !== null && "id" in value
      ? `#${(value as { id: number }).id}`
      : String(value);
  const call = (name: string, ...args: unknown[]) => log.push([name, ...args.map(label)].join(" "));
  const object = () => ({ id: ++ids });
  const gl = {
    ...K,
    getParameter(name: number) {
      if (name === K.READ_FRAMEBUFFER_BINDING) return bound.read;
      if (name === K.DRAW_FRAMEBUFFER_BINDING) return bound.draw;
      if (name === K.TEXTURE_BINDING_2D) return bound.texture;
      if (name === K.DEPTH_BITS) return 24;
      if (name === K.STENCIL_BITS) return 8;
      throw new Error(`unexpected parameter ${name}`);
    },
    isEnabled: (name: number) => name === K.SCISSOR_TEST && scissor,
    enable(name: number) {
      call("enable", name);
      if (name === K.SCISSOR_TEST) scissor = true;
    },
    disable(name: number) {
      call("disable", name);
      if (name === K.SCISSOR_TEST) scissor = false;
    },
    bindFramebuffer(target: number, framebuffer: unknown) {
      call("bindFramebuffer", target, framebuffer);
      if (target === K.FRAMEBUFFER) bound.read = bound.draw = framebuffer;
      else if (target === K.READ_FRAMEBUFFER) bound.read = framebuffer;
      else bound.draw = framebuffer;
    },
    bindTexture(_target: number, texture: unknown) {
      call("bindTexture", texture);
      bound.texture = texture;
    },
    createTexture: () => object(),
    createSampler: () => object(),
    createFramebuffer: () => object(),
    deleteTexture: (value: unknown) => call("deleteTexture", value),
    deleteSampler: (value: unknown) => call("deleteSampler", value),
    deleteFramebuffer: (value: unknown) => call("deleteFramebuffer", value),
    samplerParameteri: (...args: unknown[]) => call("samplerParameteri", ...args),
    texImage2D: (...args: unknown[]) => call("texImage2D", ...args),
    texParameteri: (...args: unknown[]) => call("texParameteri", ...args),
    framebufferTexture2D: (...args: unknown[]) => call("framebufferTexture2D", ...args),
    drawBuffers: (...args: unknown[]) => call("drawBuffers", ...args),
    checkFramebufferStatus: () => K.FRAMEBUFFER_COMPLETE,
    blitFramebuffer: (...args: unknown[]) => call("blitFramebuffer", ...args),
    viewport: (...args: unknown[]) => call("viewport", ...args),
    colorMask: (...args: unknown[]) => call("colorMask", ...args),
    clearColor: (...args: unknown[]) => call("clearColor", ...args),
    clearDepth: (...args: unknown[]) => call("clearDepth", ...args),
    clearStencil: (...args: unknown[]) => call("clearStencil", ...args),
    depthMask: (...args: unknown[]) => call("depthMask", ...args),
    stencilMask: (...args: unknown[]) => call("stencilMask", ...args),
    clear: (mask: number) => call("clear", mask),
  };
  const canvas = { width, height, getContext: () => gl } as unknown as HTMLCanvasElement;
  (gl as { canvas?: unknown }).canvas = canvas;
  return {
    canvas,
    gl: gl as unknown as WebGL2RenderingContext,
    log,
    scissorEnabled: () => scissor,
  };
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const env = { fpcw: 0x037f, mxcsr: 0x1f80 };

function frameHost(width = 640, height = 360) {
  const rec = recorder(width, height);
  const options: FrameHostOptions = {
    canvas: rec.canvas,
    environment: env,
    speedOptions: [
      { value: "0", label: "1" },
      { value: "4", label: "1.5" },
    ],
    evaluateCamera: () => ({
      viewport: { width, height },
      view: identity,
      projection: identity,
      viewProjection: identity,
      eye: [0, 0, 0],
      up: [0, 1, 0],
    }),
  };
  return { ...rec, options, host: createFrameHost(options) };
}

function entry(
  order: string[],
  label: string,
  pass: number,
  key: number,
  depth: number,
  extra: Partial<FrameDraw> = {},
): FrameDraw {
  return {
    pass,
    key,
    depth,
    draw() {
      order.push(label);
      return { draws: 1 };
    },
    ...extra,
  };
}

describe("frame host clear", () => {
  it("passes the incoming display environment without rebuilding it from matrices", () => {
    const { host, options } = frameHost();
    const environment = {
      eye: [0, 57, 44] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      fovCode: 9000,
      near: 1,
      far: 10000,
      aspect: 16 / 9,
      rollCode: 0,
      offsetX: 0,
      offsetY: 0,
    };
    const evaluate = options.evaluateCamera;
    options.evaluateCamera = (width, height) => ({
      ...evaluate(width, height),
      stageEnvironment: environment,
    });
    expect(host.readCamera().stageEnvironment).toBe(environment);
  });
  it("resets the colour, then sets the viewport and clears depth to 1 and stencil to 0", () => {
    const { host, log } = frameHost(640, 360);
    host.render(0, 0);
    expect(log).toEqual([
      "disable 3089",
      "colorMask true true true true",
      "clearColor 0 0 0 0",
      "clear 16384",
      "viewport 0 0 640 360",
      "disable 3089",
      "depthMask true",
      "clearDepth 1",
      "stencilMask 255",
      "clearStencil 0",
      "clear 1280",
    ]);
  });

  it("reports whether the background drew", () => {
    const { host } = frameHost();
    host.setBackgroundRenderer(() => false);
    host.setExternalNoteRenderer(() => ({ entries: [], notes: 0 }));
    expect(host.render(0, 0).backgroundDrawn).toBe(false);
    host.setBackgroundRenderer(() => true);
    expect(host.render(0, 0).backgroundDrawn).toBe(true);
  });

  it("keeps a history reset pending until the background draws and accepts same-time seeks", () => {
    const { host } = frameHost();
    const resets: boolean[] = [];
    let ready = false;
    host.setBackgroundRenderer((_seconds, _presentation, reset) => {
      resets.push(reset);
      return ready;
    });
    host.render(10, 0);
    ready = true;
    host.render(10, 0);
    host.render(10, 0);
    host.resetBackgroundHistory();
    host.render(10, 0);
    host.render(10, 0);
    expect(resets).toEqual([true, true, false, true, false]);
    host.dispose();
    expect(() => host.resetBackgroundHistory()).toThrow();
  });

  it("runs the background after the clear and before any draw", () => {
    const { host } = frameHost();
    const order: string[] = [];
    host.setBackgroundRenderer((seconds, presentation) => {
      order.push(`background ${seconds} ${presentation.canvas.width}`);
      return true;
    });
    host.setExternalNoteRenderer(() => ({ entries: [entry(order, "note", 16, 1, 1)], notes: 1 }));
    host.render(2.5, 0);
    expect(order).toEqual(["background 2.5 640", "note"]);
  });

  it("passes separate music and chart times to the background and notes", () => {
    const { host } = frameHost();
    const order: string[] = [];
    host.setBackgroundRenderer((seconds) => {
      order.push(`background ${seconds}`);
      return true;
    });
    host.setExternalNoteRenderer(({ seconds }) => {
      order.push(`notes ${seconds}`);
      return { entries: [], notes: 0 };
    });
    host.render(2.5, 0, 2.4);
    host.render(3, 0);
    host.render(0, 0, -0.02);
    expect(order).toEqual([
      "background 2.5",
      "notes 2.4",
      "background 3",
      "notes 3",
      "background 0",
      "notes -0.02",
    ]);
    expect(() => host.render(-1, 0)).toThrow();
  });
});

describe("frame host pass order", () => {
  it("runs passes ascending and orders each pass by its mode", () => {
    const { host } = frameHost();
    const order: string[] = [];
    host.setExternalNoteRenderer(() => ({
      entries: [
        entry(order, "p24", 24, 1, 1),
        entry(order, "p16-a", 16, 2, 1),
        entry(order, "p8", 8, 1, 3),
        entry(order, "p16-b", 16, 1, 5),
        entry(order, "p4", 4, 1, 0),
        entry(order, "p16-c", 16, 2, 9),
      ],
      notes: 0,
    }));
    host.render(0, 0);
    expect(order).toEqual(["p4", "p8", "p16-b", "p16-c", "p16-a", "p24"]);
  });

  it("keeps arrival order for entries that share pass, key and depth, scenery first", () => {
    const { host } = frameHost();
    const order: string[] = [];
    host.setScenery(() => [entry(order, "field", 16, 3, 2)]);
    host.setExternalNoteRenderer(() => ({
      entries: [
        entry(order, "n1", 16, 3, 2),
        entry(order, "n2", 16, 3, 2),
        entry(order, "fx", 16, 3, 2),
      ],
      notes: 2,
    }));
    host.render(0, 0);
    expect(order).toEqual(["field", "n1", "n2", "fx"]);
  });

  it("returns the draw count and the notes", () => {
    const { host } = frameHost();
    host.setExternalNoteRenderer(() => ({
      entries: [entry([], "a", 16, 1, 1)],
      notes: 7,
    }));
    expect(host.render(0, 0)).toEqual({
      draws: 1,
      notes: 7,
      backgroundDrawn: false,
    });
  });
});

describe("frame host depth snapshot", () => {
  it("is not taken when no draw asks for it", () => {
    const { host, log } = frameHost();
    host.setExternalNoteRenderer(() => ({ entries: [entry([], "a", 16, 1, 1)], notes: 1 }));
    host.render(0, 0);
    expect(log.some((line) => line.startsWith("blitFramebuffer"))).toBe(false);
  });

  it("is taken once, before the first pass from 16 that has draws, and shared by later draws", () => {
    const { host, log } = frameHost();
    const seen = new Map<string, unknown>();
    const record = (label: string, pass: number, key: number, requiresDepthSnapshot = false) => ({
      pass,
      key,
      depth: 1,
      requiresDepthSnapshot,
      draw(context: { depth: unknown }) {
        seen.set(label, context.depth);
        log.push(`draw ${label}`);
        return { draws: 1 };
      },
    });
    host.setExternalNoteRenderer(() => ({
      entries: [
        record("p12", 12, 1),
        record("p16-a", 16, 1, true),
        record("p16-b", 16, 2),
        record("p24", 24, 1),
      ],
      notes: 0,
    }));
    host.render(0, 0);
    const blits = log.filter((line) => line.startsWith("blitFramebuffer"));
    expect(blits).toHaveLength(1);
    const blitAt = log.indexOf(blits[0]);
    expect(log.indexOf("draw p12")).toBeLessThan(blitAt);
    expect(blitAt).toBeLessThan(log.indexOf("draw p16-a"));
    expect(seen.get("p12")).toBeNull();
    expect(seen.get("p16-a")).not.toBeNull();
    expect(seen.get("p16-b")).toBe(seen.get("p16-a"));
    expect(seen.get("p24")).toBe(seen.get("p16-a"));
  });

  it("copies depth from the default framebuffer and restores bindings and scissor", () => {
    const { host, log, gl } = frameHost();
    host.setBackgroundRenderer(() => {
      gl.enable(gl.SCISSOR_TEST);
      return true;
    });
    host.setExternalNoteRenderer(() => ({
      entries: [entry([], "a", 16, 1, 1, { requiresDepthSnapshot: true })],
      notes: 1,
    }));
    host.render(0, 0);
    const blitAt = log.findIndex((line) => line.startsWith("blitFramebuffer"));
    expect(log[blitAt]).toBe("blitFramebuffer 0 0 640 360 0 0 640 360 256 9728");
    expect(log.slice(blitAt - 1, blitAt)).toEqual(["disable 3089"]);
    expect(log.slice(blitAt + 1)).toEqual([
      "bindFramebuffer 36008 null",
      "bindFramebuffer 36009 null",
      "bindTexture null",
      "enable 3089",
    ]);
  });

  it("uses point sampling for non-comparison depth reads", () => {
    const { host, log, gl } = frameHost();
    host.setExternalNoteRenderer(() => ({
      entries: [entry([], "a", 16, 1, 1, { requiresDepthSnapshot: true })],
      notes: 1,
    }));
    host.render(0, 0);
    expect(log).toContain(`samplerParameteri #2 ${gl.TEXTURE_MIN_FILTER} ${gl.NEAREST}`);
    expect(log).toContain(`samplerParameteri #2 ${gl.TEXTURE_MAG_FILTER} ${gl.NEAREST}`);
  });

  it("copies a screen camera's offset rectangle into local depth coordinates", () => {
    const { gl, log } = recorder(640, 360);
    const snapshot = createDepthSnapshot(gl);
    snapshot.capture(null, 320, 180, 60, 175);
    expect(log).toContain("blitFramebuffer 60 175 380 355 0 0 320 180 256 9728");
    snapshot.capture(null, 320, 180, 100, 20);
    expect(log).toContain("blitFramebuffer 100 20 420 200 0 0 320 180 256 9728");
    expect(log.filter((line) => line.startsWith("texImage2D"))).toHaveLength(1);
    snapshot.dispose();
  });

  it("retries a snapshot allocation after an incomplete framebuffer", () => {
    const { gl, log } = recorder(640, 360);
    const status = vi.spyOn(gl, "checkFramebufferStatus");
    status.mockReturnValueOnce(0).mockReturnValue(gl.FRAMEBUFFER_COMPLETE);
    const snapshot = createDepthSnapshot(gl);
    expect(() => snapshot.capture()).toThrow(/帧缓冲不完整/);
    snapshot.capture();
    snapshot.capture();
    expect(status).toHaveBeenCalledTimes(2);
    expect(log.filter((line) => line.startsWith("texImage2D"))).toHaveLength(2);
    expect(log.filter((line) => line.startsWith("blitFramebuffer"))).toHaveLength(2);
    snapshot.dispose();
  });

  it("deletes its GL objects on dispose", () => {
    const { host, log } = frameHost();
    host.setExternalNoteRenderer(() => ({
      entries: [entry([], "a", 16, 1, 1, { requiresDepthSnapshot: true })],
      notes: 1,
    }));
    host.render(0, 0);
    host.dispose();
    expect(log.filter((line) => line.startsWith("delete"))).toEqual([
      "deleteFramebuffer #3",
      "deleteTexture #1",
      "deleteSampler #2",
    ]);
  });
});

describe("frame host validation", () => {
  it("rejects a speed row outside the options", () => {
    const { host } = frameHost();
    expect(() => host.render(0, 9)).toThrow(RangeError);
  });

  it("rejects an unknown pass, a bad key, a non-binary32 depth and an early snapshot", () => {
    const { host } = frameHost();
    const rendering = (patch: Partial<FrameDraw>) => {
      host.setExternalNoteRenderer(() => ({
        entries: [entry([], "x", 16, 1, 1, patch)],
        notes: 0,
      }));
      return () => host.render(0, 0);
    };
    expect(rendering({ pass: 5 })).toThrow(RangeError);
    expect(rendering({ key: 0x10000 })).toThrow(RangeError);
    expect(rendering({ depth: 0.1 })).toThrow(RangeError);
    expect(rendering({ pass: 12, requiresDepthSnapshot: true })).toThrow(RangeError);
  });

  it("refuses to render after dispose", () => {
    const { host } = frameHost();
    host.dispose();
    expect(() => host.render(0, 0)).toThrow();
  });
});

describe("frame host presentation", () => {
  it("advances the execution sequence after each external draw and on explicit marks", () => {
    const { host } = frameHost();
    const seen: number[] = [];
    const sample = (): FrameDraw => ({
      pass: 16,
      key: 1,
      depth: 1,
      draw() {
        seen.push(host.withPresentation((p) => p.executionSequence));
        return { draws: 1 };
      },
    });
    host.setExternalNoteRenderer(() => ({ entries: [sample(), sample()], notes: 2 }));
    host.render(0, 0);
    expect(seen[1]).toBeGreaterThan(seen[0]);
    const before = host.withPresentation((p) => p.executionSequence);
    host.withPresentation((p) => p.markExternalBindingsUnknown());
    expect(host.withPresentation((p) => p.executionSequence)).toBe(before + 1);
  });

  const sampled = (
    host: ReturnType<typeof frameHost>["host"],
    seen: number[],
    pass: number,
    extra: Partial<FrameDraw> = {},
  ): FrameDraw => ({
    pass,
    key: 1,
    depth: 1,
    draw() {
      seen.push(host.withPresentation((p) => p.executionSequence));
      return { draws: 1 };
    },
    ...extra,
  });

  it("keeps the execution sequence between consecutive draws of one source", () => {
    const { host } = frameHost();
    const seen: number[] = [];
    const source = {};
    host.setExternalNoteRenderer(() => ({
      entries: [sampled(host, seen, 16, { source }), sampled(host, seen, 16, { source })],
      notes: 2,
    }));
    host.render(0, 0);
    expect(seen[1]).toBe(seen[0]);
    host.render(0, 0);
    expect(seen[2]).toBeGreaterThan(seen[1]);
  });

  it("advances the sequence when a draw of another or no source comes between", () => {
    const { host } = frameHost();
    const seen: number[] = [];
    const source = {};
    host.setExternalNoteRenderer(() => ({
      entries: [
        sampled(host, seen, 16, { source }),
        sampled(host, seen, 16, { source: {} }),
        sampled(host, seen, 16, { source }),
        sampled(host, seen, 16),
        sampled(host, seen, 16, { source }),
      ],
      notes: 5,
    }));
    host.render(0, 0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it("advances the sequence after taking the depth snapshot", () => {
    const { host } = frameHost();
    const seen: number[] = [];
    const source = {};
    host.setExternalNoteRenderer(() => ({
      entries: [
        sampled(host, seen, 8, { source }),
        sampled(host, seen, 16, { source, requiresDepthSnapshot: true }),
      ],
      notes: 2,
    }));
    host.render(0, 0);
    expect(seen[1]).toBeGreaterThan(seen[0]);
  });
});
