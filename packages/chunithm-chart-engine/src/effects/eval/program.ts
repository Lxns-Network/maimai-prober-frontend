import type { EffectNode, EffectResource } from "../afb";

const f = Math.fround;

export interface MatrixRecord {
  readonly mode: number;
  readonly kind: number;
  readonly valueMode: number;
  readonly uniformAxes: boolean;
  readonly value: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly randomRange: readonly [number, number, number];
  readonly waveHighMin: readonly [number, number, number];
  readonly waveHighMax: readonly [number, number, number];
  readonly period: readonly [number, number];
  readonly phase: readonly [number, number];
}

export interface GoalRecord {
  readonly target: readonly [number, number, number];
  readonly start: number;
  readonly duration: number;
  readonly exponent: number;
  readonly kind: number;
  readonly easing: number;
}

export interface MaterialKey {
  readonly color: number;
  readonly secondColor: number;
  readonly duration: number;
  readonly mode: number;
  readonly period: number;
}

export interface Curve {
  readonly component: number;
  readonly interpolation: number;
  readonly keys: Float64Array;
  readonly count: number;
}

export interface PatternProgram {
  readonly columns: number;
  readonly rows: number;
  readonly interval: number;
  readonly first: number;
  readonly last: number;
  readonly direction: number;
  readonly initial: number;
  readonly loop: boolean;
  readonly order: number;
}

export type MotionProgram =
  | { readonly type: 751; readonly offset: number; readonly resetAt: number }
  | { readonly type: 120; readonly offset: number }
  | {
      readonly type: 200;
      readonly offset: number;
      readonly count: number;
      readonly first: readonly number[];
      readonly last: readonly number[];
    }
  | {
      readonly type: 201;
      readonly offset: number;
      readonly count: number;
      readonly axis: number;
      readonly first: number;
      readonly last: number;
      readonly radius: number;
      readonly rotate: boolean;
    }
  | {
      readonly type: 202;
      readonly offset: number;
      readonly count: number;
      readonly rows: Float64Array;
    }
  | {
      readonly type: 700;
      readonly offset: number;
      readonly elementOffset: number;
      readonly requested: number;
      readonly count: number;
    }
  | { readonly type: 401; readonly offset: number; readonly pattern: PatternProgram }
  | {
      readonly type: 403;
      readonly offset: number;
      readonly relative: boolean;
      readonly target: number;
      readonly value: readonly [number, number];
    }
  | {
      readonly type: 402;
      readonly offset: number;
      readonly target: number;
      readonly rect: readonly [number, number, number, number];
    }
  | {
      readonly type: 100;
      readonly offset: number;
      readonly records: readonly MatrixRecord[];
      readonly hasRandom: boolean;
      readonly hasIntegrated: boolean;
    }
  | { readonly type: 1003; readonly offset: number; readonly curves: readonly Curve[] }
  | {
      readonly type: 106;
      readonly offset: number;
      readonly goals: readonly GoalRecord[];
      readonly endless: boolean;
    }
  | {
      readonly type: 300;
      readonly offset: number;
      readonly keys: readonly MaterialKey[];
      readonly keyed: boolean;
      readonly hasOscillation: boolean;
      readonly loop: boolean;
      readonly parentColor: boolean;
      readonly mask: number;
    };

export interface PrimitiveProgram {
  readonly minimumRadius: number;
  readonly maximumRadius: number;
  readonly angleMaximum: number;
  readonly angleMinimum: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface GeometryProgram {
  readonly count: number;
  /** Per vertex: U, V, X, Y, Z. */
  readonly values: Float32Array;
  /** Per vertex: the authored color. */
  readonly colors: Uint32Array;
}

export interface AnimationProgram {
  readonly node: NodeProgram;
  readonly motions: readonly MotionProgram[];
  readonly elements300: readonly number[];
  readonly colorInitial: number;
  readonly primitive: PrimitiveProgram | null;
  readonly geometry: GeometryProgram | null;
}

export interface NodeProgram {
  readonly offset: number;
  readonly index: number;
  readonly type: number;
  readonly id: number;
  readonly flags: number;
  readonly parent: number | null;
  /** Children in authored order. */
  readonly children: readonly NodeProgram[];
  /** Children that start themselves, in authored order. */
  readonly autoChildren: readonly NodeProgram[];
  readonly start: number;
  readonly interval: number;
  readonly count: number;
  readonly emissions: number;
  readonly life: number;
  /** The transform is reduced to its translation before the node animates. */
  readonly translationOnly: boolean;
  readonly hasColor: boolean;
  readonly color: number;
  readonly animated: boolean;
  readonly coordinateMode: number;
  readonly layerSource: number;
  readonly prioritySource: number;
}

export interface DisplayProgram {
  readonly root: NodeProgram;
  readonly child: NodeProgram | null;
  readonly stateId: number;
}

/** The static program of one effect resource: its nodes, display selections and per-node animation programs. */
export interface EffectProgram {
  readonly resource: EffectResource;
  readonly id: number;
  readonly nodes: readonly NodeProgram[];
  /** Largest number of self-starting children of one node. */
  readonly maxSchedules: number;
  node(offset: number): NodeProgram;
  display(animation: number, requested: number): DisplayProgram;
  animation(node: NodeProgram): AnimationProgram;
  /** Layer of every node when a player publishes `layerParameter`; indexed by node index. */
  publishedLayers(layerParameter: number): Int32Array;
}

function fail(message: string): never {
  throw new RangeError(`Unsupported effect program: ${message}`);
}

const SUPPORTED_MOTIONS = [100, 106, 120, 200, 201, 202, 300, 401, 402, 403, 700, 751, 1003];

export function readEffectProgram(resource: EffectResource): EffectProgram {
  const r = resource;
  const byOffset = new Map<number, NodeProgram>();
  const source = new Map<number, EffectNode>(r.nodes.map((n) => [n.offset, n]));
  const nodes: NodeProgram[] = [];
  const childLists = new Map<number, NodeProgram[]>();
  const autoLists = new Map<number, NodeProgram[]>();
  r.nodes.forEach((n, index) => {
    const c = r.pointer(n.controller + 4)!;
    const colorElement = n.elements.find((e) => e.type === 101);
    const hasColor = colorElement !== undefined && colorElement.data !== null;
    const animated =
      n.elements.length > 0 || n.states.some((s) => s.motions.some((m) => m.type !== 751));
    const node: NodeProgram = {
      offset: n.offset,
      index,
      type: n.type,
      id: n.id,
      flags: n.flags,
      parent: n.parent,
      get children() {
        return childLists.get(n.offset)!;
      },
      get autoChildren() {
        return autoLists.get(n.offset)!;
      },
      start: r.f32(c + 8),
      interval: r.f32(c + 40),
      count: r.i32(c + 32),
      emissions: r.i32(c + 52),
      life: r.f32(c + 16),
      translationOnly: r.u32(n.offset + 24) === 1,
      hasColor,
      color: hasColor ? r.u32(colorElement!.data!) : 0,
      animated,
      coordinateMode: r.i32(n.offset + 48),
      layerSource: r.i32(n.offset + 40),
      prioritySource: r.i32(n.offset + 44),
    };
    byOffset.set(n.offset, node);
    nodes.push(node);
  });
  for (const n of r.nodes) {
    const list = n.children.map((offset) => byOffset.get(offset)!);
    childLists.set(n.offset, list);
    autoLists.set(
      n.offset,
      list.filter((c) => c.flags & 1),
    );
  }
  let maxSchedules = 0;
  for (const list of autoLists.values()) maxSchedules = Math.max(maxSchedules, list.length);

  const displays = new Map<number, DisplayProgram>();
  const animations = new Map<number, AnimationProgram>();
  const layerTables = new Map<number, Int32Array>();

  function display(animation: number, requested: number): DisplayProgram {
    const key = animation * 4294967296 + (requested + 1);
    const cached = displays.get(key);
    if (cached) return cached;
    const rootSource = r.nodes.find((n) => n.id === animation);
    if (!rootSource || requested < -1) fail(`animation ${animation} state ${requested}`);
    const state =
      rootSource.states.find((s) => s.id === requested) ??
      rootSource.states.find((s) => s.id === rootSource.defaultState) ??
      rootSource.states[0];
    if (!state) fail("root state");
    let child: NodeProgram | null = null;
    const commands = state.motions.filter((m) => m.type === 751);
    if (commands.length) {
      const d = commands[0].data!;
      const command = r.pointer(d + 20)!;
      child =
        nodes.find((n) => n.id === r.i32(command + 12) && n.parent === rootSource.offset) ?? null;
      if (!child) fail("command target");
    }
    const value: DisplayProgram = {
      root: byOffset.get(rootSource.offset)!,
      child,
      stateId: state.id,
    };
    displays.set(key, value);
    return value;
  }

  function motionChain(nodeSource: EffectNode, field: number) {
    const header = r.pointer(nodeSource.offset + field, true);
    if (header === null) return [];
    const count = r.u32(header + 4);
    const out: { offset: number; type: number; data: number | null }[] = [];
    let at = count ? r.pointer(header) : null;
    for (let i = 0; i < count; i++) {
      const offset = at!;
      out.push({ offset, type: r.u32(offset), data: r.pointer(offset + 36, true) });
      at = r.pointer(offset + 32, true);
    }
    return out;
  }

  function decodeMatrixRecords(d: number): MatrixRecord[] {
    const head = r.pointer(d + 8)!;
    return Array.from({ length: r.u32(d + 4) }, (_, index) => {
      const at = head + index * 116;
      const value = [r.f32(at + 52), r.f32(at + 56), r.f32(at + 60)] as const;
      const max = [r.f32(at + 68), r.f32(at + 72), r.f32(at + 76)] as const;
      return {
        mode: r.u32(at),
        kind: r.u32(at + 4),
        valueMode: r.u32(at + 12),
        uniformAxes: r.u32(at + 20) !== 0,
        value,
        max,
        randomRange: [f(max[0] - value[0]), f(max[1] - value[1]), f(max[2] - value[2])] as const,
        waveHighMin: [r.f32(at + 84), r.f32(at + 88), r.f32(at + 92)] as const,
        waveHighMax: [r.f32(at + 100), r.f32(at + 104), r.f32(at + 108)] as const,
        period: [r.f32(at + 36), r.f32(at + 40)] as const,
        phase: [r.f32(at + 44), r.f32(at + 48)] as const,
      };
    });
  }

  function decodeMotion(
    nodeSource: EffectNode,
    m: { offset: number; type: number; data: number | null },
  ): MotionProgram {
    if (m.data === null || !SUPPORTED_MOTIONS.includes(m.type)) fail(`motion ${m.type}`);
    const d = m.data;
    const controller = r.pointer(nodeSource.controller + 4)!;
    switch (m.type) {
      case 751:
        return { type: 751, offset: m.offset, resetAt: r.i32(d + 8) };
      case 120:
        return { type: 120, offset: m.offset };
      case 200:
        return {
          type: 200,
          offset: m.offset,
          count: r.i32(controller + 32),
          first: [r.f32(d), r.f32(d + 4), r.f32(d + 8)],
          last: [r.f32(d + 16), r.f32(d + 20), r.f32(d + 24)],
        };
      case 201:
        return {
          type: 201,
          offset: m.offset,
          count: r.i32(controller + 32),
          axis: r.u32(d),
          first: r.f32(d + 4),
          last: r.f32(d + 8),
          radius: r.f32(d + 12),
          rotate: r.u32(d + 16) !== 0,
        };
      case 202: {
        const count = r.u32(d + 4);
        const head = r.pointer(d + 8)!;
        const rows = new Float64Array(count * 9);
        for (let i = 0; i < count; i++) {
          const at = head + i * 48;
          for (let k = 0; k < 3; k++) {
            rows[i * 9 + k] = r.f32(at + k * 4);
            rows[i * 9 + 3 + k] = r.f32(at + 16 + k * 4);
            rows[i * 9 + 6 + k] = r.f32(at + 32 + k * 4);
          }
        }
        return { type: 202, offset: m.offset, count, rows };
      }
      case 700: {
        const ordinal = r.i32(m.offset + 28);
        const type = r.u32(d);
        const preferred = ordinal >= 0 ? nodeSource.elements[ordinal] : undefined;
        const element =
          preferred?.type === type ? preferred : nodeSource.elements.find((e) => e.type === type);
        if (type !== 300 || !element) fail("texture selection target");
        return {
          type: 700,
          offset: m.offset,
          elementOffset: element.offset,
          requested: r.i32(d + 4),
          count: r.u32(element.offset + 12),
        };
      }
      case 401: {
        const int = (offset: number) => r.i32(d + offset);
        return {
          type: 401,
          offset: m.offset,
          pattern: {
            columns: int(24),
            rows: int(28) < 1 ? int(24) : int(28),
            interval: r.f32(d + 32),
            first: int(36),
            last: int(40),
            direction: int(44),
            initial: int(48),
            loop: int(52) !== 0,
            order: int(20),
          },
        };
      }
      case 403:
        return {
          type: 403,
          offset: m.offset,
          relative: r.u32(d) === 1,
          target: r.i32(d + 4),
          value: [r.f32(d + 16), r.f32(d + 20)],
        };
      case 402:
        return {
          type: 402,
          offset: m.offset,
          target: r.i32(d),
          rect: [r.f32(d + 8), r.f32(d + 12), r.f32(d + 16), r.f32(d + 20)],
        };
      case 100: {
        const records = decodeMatrixRecords(d);
        const isRandom = (record: MatrixRecord) =>
          record.mode === 4 || record.mode === 5 || (r.id === 60 && record.mode === 7);
        return {
          type: 100,
          offset: m.offset,
          records,
          hasRandom: records.some(isRandom),
          hasIntegrated: records.some((record) => record.mode === 5),
        };
      }
      case 1003: {
        const head = r.pointer(d + 20)!;
        const curves = Array.from({ length: r.u32(d) }, (_, i) => {
          const record = head + i * 32;
          const count = r.u32(record + 24);
          const keysAt = r.pointer(record + 28)!;
          const keys = new Float64Array(count * 6);
          for (let j = 0; j < count; j++)
            for (let k = 0; k < 6; k++) keys[j * 6 + k] = r.f32(keysAt + j * 28 + k * 4);
          return {
            component: r.u32(record),
            interpolation: r.u32(record + 8),
            keys,
            count,
          };
        });
        return { type: 1003, offset: m.offset, curves };
      }
      case 106: {
        const head = r.pointer(d)!;
        const goals = Array.from({ length: r.u32(d + 4) }, (_, i) => {
          const at = head + i * 92;
          return {
            target: [r.f32(at), r.f32(at + 4), r.f32(at + 8)] as const,
            start: r.f32(at + 32),
            duration: r.f32(at + 44),
            exponent: r.f32(at + 60),
            kind: r.u32(at + 36),
            easing: r.u32(at + 56),
          };
        });
        return { type: 106, offset: m.offset, goals, endless: r.i32(d + 16) < 0 };
      }
      default: {
        const head = r.pointer(d + 16)!;
        const keys = Array.from({ length: r.u32(d + 12) }, (_, i) => {
          const at = head + i * 40;
          return {
            color: r.u32(at),
            secondColor: r.u32(at + 4),
            duration: r.f32(at + 32),
            mode: r.u32(at + 12),
            period: r.f32(at + 16),
          };
        });
        return {
          type: 300,
          offset: m.offset,
          keys,
          keyed:
            keys.some((key) => key.mode === 3) ||
            (keys.length > 1 && keys.some((key) => key.mode === 5)),
          hasOscillation: keys.some((key) => key.mode === 5),
          loop: r.u32(d + 24) !== 0,
          parentColor: r.u32(d + 28) !== 0 && r.u32(d + 36) === 5,
          mask: r.u32(d + 40),
        };
      }
    }
  }

  function animation(node: NodeProgram): AnimationProgram {
    const cached = animations.get(node.offset);
    if (cached) return cached;
    const nodeSource = source.get(node.offset)!;
    if (![3, 100, 204, 6001008].includes(node.type)) fail("animated node type");
    if (nodeSource.states.length !== 1) fail("single selected state");
    const list = [
      ...motionChain(nodeSource, 72),
      ...nodeSource.states[0].motions.map((m) => ({
        offset: m.offset,
        type: m.type,
        data: m.data,
      })),
      ...motionChain(nodeSource, 76),
    ];
    const motions = list.map((m) => decodeMotion(nodeSource, m));
    const element101 = nodeSource.elements.find((e) => e.type === 101);
    let primitive: PrimitiveProgram | null = null;
    if (node.type === 100) {
      const settings = nodeSource.settings!;
      const halfWidth = f(r.f32(settings + 16) * 0.5);
      primitive = {
        minimumRadius: r.f32(settings + 8),
        maximumRadius: r.f32(settings + 4),
        angleMaximum: r.u32(settings + 36),
        angleMinimum: r.u32(settings + 40),
        halfWidth,
        halfHeight: r.u32(settings + 32)
          ? f(halfWidth * f(r.f32(settings + 24) / r.f32(settings + 16)))
          : f(r.f32(settings + 24) * 0.5),
      };
    }
    let geometry: GeometryProgram | null = null;
    if (node.type === 204) {
      const element = nodeSource.elements.find((e) => e.type === 102)!;
      const count = r.u32(element.data!);
      const head = r.pointer(element.data! + 4)!;
      const values = new Float32Array(count * 5);
      const colors = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        const at = head + i * 24;
        values[i * 5] = r.f32(at);
        values[i * 5 + 1] = r.f32(at + 4);
        values[i * 5 + 2] = r.f32(at + 12);
        values[i * 5 + 3] = r.f32(at + 16);
        values[i * 5 + 4] = r.f32(at + 20);
        colors[i] = r.u32(at + 8);
      }
      geometry = { count, values, colors };
    }
    const value: AnimationProgram = {
      node,
      motions,
      elements300: nodeSource.elements.filter((e) => e.type === 300).map((e) => e.offset),
      colorInitial: element101 && element101.data !== null ? r.u32(element101.data) : 0xffffffff,
      primitive,
      geometry,
    };
    animations.set(node.offset, value);
    return value;
  }

  function publishedLayers(layerParameter: number): Int32Array {
    const cached = layerTables.get(layerParameter);
    if (cached) return cached;
    const layers = new Int32Array(nodes.length);
    const visit = (siblings: readonly number[], inherited: number) => {
      for (const offset of siblings) {
        const sourceNode = source.get(offset)!;
        const program = byOffset.get(offset)!;
        const sourceLayer = offset === r.roots[0] ? -1 : program.layerSource;
        const byte = ((sourceLayer === -1 ? inherited : sourceLayer) << 24) >> 24;
        const layer = byte < -1 ? 0 : byte >= 32 ? 31 : byte;
        layers[program.index] = layer < 0 ? 5 : layer;
        visit(sourceNode.children, layer);
        inherited = layer;
      }
    };
    visit(r.roots, layerParameter);
    layerTables.set(layerParameter, layers);
    return layers;
  }

  return {
    resource,
    id: r.id,
    nodes,
    maxSchedules,
    node(offset) {
      const value = byOffset.get(offset);
      if (!value) fail(`node ${offset}`);
      return value;
    },
    display,
    animation,
    publishedLayers,
  };
}
