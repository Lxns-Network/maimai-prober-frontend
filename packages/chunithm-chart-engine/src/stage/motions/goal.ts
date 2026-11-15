import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { inverseAffine, multiplyAffine, rotateCodes, setIdentity } from "../../math/matrix";
import { angleCode, sine, translateLocal } from "./affine";
import { MatrixElement, nthElement } from "../elements";
import { nodeClock } from "./common";
import { displayCameraMatrix, sceneCamera } from "./turnCamera";
import { sinCosCode } from "../camera/math";

const f = Math.fround;
const RECORD_BYTES = 92;
const EPSILON = f(0.0000001);

interface GoalRecord {
  readonly at: number;
  readonly start: number;
  readonly channel: number;
  readonly duration: number;
  readonly durationLimit: number;
  readonly kind: number;
  readonly curve: number;
  readonly exponent: number;
  readonly randomized: boolean;
  readonly linked: boolean;
  readonly sourced: boolean;
  readonly coordinate: number;
}

const codes = new Int32Array(3);
const diagonal = new Float32Array(16);
const product = new Float32Array(16);

function fail(message: string): never {
  throw new RangeError(`Stage goal: ${message}`);
}

/** The fractional part, toward zero. */
function fraction(value: number): number {
  return value >= 0 ? f(value - Math.floor(value)) : f(value - Math.ceil(value));
}

class GoalMotion implements MotionInstance {
  readonly behavior = goalMotion;
  readonly records: GoalRecord[] = [];
  readonly values: Float32Array;
  readonly durations: Float32Array;
  readonly times: Float32Array;
  readonly states: Uint8Array;
  readonly starts: Float32Array;
  readonly base = new Float32Array(16);
  readonly current = new Float32Array(16);
  readonly loopLimit: number;
  readonly keep: boolean;
  readonly restart: boolean;
  readonly elementIndex: number;
  readonly mode: number;
  readonly totalDuration: number;
  readonly clock: number;
  readonly lead: number;
  durationOrigin = 0;
  skippedStart = false;
  began = false;
  loops: number;
  elapsed = 0;
  initialized = false;
  finished = false;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const data = record.data ?? fail("motion without data");
    this.elementIndex = g.i32(data + 8);
    this.mode = g.u32(data + 12);
    if (this.mode > 3) fail(`target mode ${this.mode}`);
    this.clock = g.u32(data + 28);
    if (this.clock > 3) fail(`start clock ${this.clock}`);
    this.lead = g.f32(data + 32);
    this.totalDuration = g.f32(data + 36);
    this.loopLimit = g.i32(data + 16);
    this.loops = this.loopLimit;
    this.keep = g.u32(data + 20) !== 0;
    this.restart = g.u32(data + 24) !== 0;
    const count = g.i32(data + 4);
    const head = count > 0 ? g.target(data) : 0;
    for (let i = 0; i < count; i++) {
      const at = head + i * RECORD_BYTES;
      const kind = g.u32(at + 0x28);
      if (kind > 2) fail(`interpolation kind ${kind}`);
      const sourced = g.u32(at + 0x40) !== 0;
      if (sourced && g.u32(at + 0x4c) > 2) fail(`source scope ${g.u32(at + 0x4c)}`);
      const channel = g.u32(at + 0x24);
      if (channel > 2) fail(`channel ${channel}`);
      const coordinate = g.u32(at + 0x34);
      if (this.mode === 3 && channel === 0 && coordinate > 4)
        fail(`target coordinate ${coordinate}`);
      const curve = g.u32(at + 0x38);
      if (curve > 5) fail(`curve ${curve}`);
      this.records.push({
        at,
        start: g.f32(at + 0x20),
        channel,
        duration: g.f32(at + 0x2c),
        durationLimit: g.f32(at + 0x30),
        kind,
        curve,
        exponent: g.f32(at + 0x3c),
        randomized: g.u32(at + 0x54) !== 0,
        linked: g.u32(at + 0x58) !== 0,
        sourced,
        coordinate,
      });
    }
    this.values = new Float32Array(count * 4);
    this.durations = new Float32Array(count);
    this.times = new Float32Array(count);
    this.states = new Uint8Array(count);
    this.starts = Float32Array.from(this.records, (r) => r.start);
    this.begin(node);
    setIdentity(this.base);
    setIdentity(this.current);
  }

  private duration(r: GoalRecord): number {
    return r.durationLimit >= 0
      ? this.scene.random.floatRange(r.durationLimit, r.duration)
      : r.duration;
  }

  private begin(node: StageNode): void {
    this.durationOrigin = Math.max(nodeClock(node, this.clock, 0), 0);
    const lead = f(this.lead + this.durationOrigin);
    if (lead > 0) this.skippedStart = true;
    if (lead < 0) return;
    this.elapsed = f(this.elapsed + lead);
    let remaining = lead;
    this.records.forEach((r, i) => {
      this.times[i] = 0;
      this.states[i] = 0;
      const duration = this.duration(r);
      this.durations[i] = duration;
      if (!this.skippedStart) return;
      const start = this.starts[i];
      if (start >= 0) {
        if (f(lead - start) < duration) {
          if (start <= lead) this.times[i] = f(lead - start);
          else if (!this.began) this.starts[i] = f(start - lead);
        } else this.times[i] = duration;
        remaining = Math.max(f(f(lead - this.starts[i]) - duration), 0);
      } else if (remaining < duration) {
        this.times[i] = remaining;
        remaining = 0;
      } else {
        this.times[i] = duration;
        remaining = f(remaining - duration);
      }
      this.states[i] = 1;
    });
    this.began = true;
  }

  private initialize(node: StageNode): void {
    const g = this.scene.graph;
    const random = this.scene.random;
    const previous = new Float32Array(3);
    this.records.forEach((r, i) => {
      const at = r.at;
      const v = this.values.subarray(i * 4, i * 4 + 4);
      this.durations[i] = this.duration(r);
      if (r.randomized) {
        if (r.linked) {
          const low = g.f32(at + 0x10);
          const high = g.f32(at);
          v[0] = random.floatRange(low, high);
          const t = f(f(v[0] - low) / f(high - low));
          for (let k = 1; k < 3; k++)
            v[k] = f(f(f(1 - t) * g.f32(at + 0x10 + k * 4)) + f(g.f32(at + k * 4) * t));
        } else
          for (let k = 0; k < 3; k++)
            v[k] = random.floatRange(g.f32(at + 0x10 + k * 4), g.f32(at + k * 4));
      } else for (let k = 0; k < 4; k++) v[k] = g.f32(at + k * 4);
      v[3] = 0;
      if (this.mode === 3 && r.channel === 0) {
        if (r.coordinate === 0) {
          for (let k = 0; k < 3; k++) v[k] = f(previous[k] + v[k]);
        } else {
          const matrix = this.target(node);
          if (!matrix) return;
          const x = v[0];
          const y = v[1];
          const z = v[2];
          if (r.coordinate === 1) {
            const inverse = new Float32Array(16);
            inverseAffine(matrix, inverse);
            for (let k = 0; k < 3; k++)
              v[k] = f(
                f(f(f(inverse[k + 4] * y) + f(inverse[k] * x)) + f(inverse[k + 8] * z)) +
                  inverse[k + 12],
              );
            v[3] = 1;
          } else {
            const converted = Float32Array.of(x, y, z);
            if (r.coordinate >= 3) {
              const camera = displayCameraMatrix(this.scene);
              if (r.coordinate === 3) {
                const inverse = new Float32Array(16);
                inverseAffine(camera, inverse);
                for (let k = 0; k < 3; k++)
                  converted[k] = f(
                    f(f(f(inverse[k] * x) + f(inverse[k + 4] * y)) + f(inverse[k + 8] * z)) +
                      inverse[k + 12],
                  );
              } else {
                for (let k = 0; k < 3; k++)
                  converted[k] = f(
                    f(f(camera[k * 4 + 1] * y) + f(camera[k * 4] * x)) + f(camera[k * 4 + 2] * z),
                  );
              }
            }
            const roll = sceneCamera(this.scene).roll;
            if (roll > 0) {
              const { sin, cos } = sinCosCode(-roll);
              const x = converted[0];
              const y = converted[1];
              converted[0] = f(f(x * cos) - f(y * sin));
              converted[1] = f(f(x * sin) + f(y * cos));
            }
            for (let k = 0; k < 3; k++) {
              const value = f(
                f(f(matrix[k * 4] * converted[0]) + f(matrix[k * 4 + 1] * converted[1])) +
                  f(matrix[k * 4 + 2] * converted[2]),
              );
              v[k] = r.coordinate === 3 ? value : f(value + previous[k]);
            }
          }
        }
        previous.set(v.subarray(0, 3));
      }
    });
    this.initialized = true;
  }

  private target(node: StageNode): Float32Array | null {
    return this.elementIndex >= 0
      ? (nthElement<MatrixElement>(node, 100, this.elementIndex)?.matrix ?? null)
      : node.world;
  }

  /** Moves `acc` toward the record's value; returns false while the record is still running. */
  private approach(i: number, acc: Float32Array, v: Float32Array): boolean {
    const r = this.records[i];
    const time = this.times[i];
    const duration = this.durations[i];
    if (r.kind === 2) {
      const running = time < duration;
      const span = running ? time : duration;
      for (let k = 0; k < 3; k++) acc[k] = f(acc[k] + f(v[k] * span));
      if (!running) this.states[i] = 2;
      return !running;
    }
    if (r.kind === 1) {
      const dx = f(v[0] - acc[0]);
      const dy = f(v[1] - acc[1]);
      const dz = f(v[2] - acc[2]);
      const squared = f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz));
      const reciprocal =
        Math.abs(squared) < EPSILON || Math.abs(f(squared - 1)) < EPSILON
          ? 1
          : f(1 / f(Math.sqrt(squared)));
      const span = f(time * duration);
      acc[0] = f(acc[0] + f(f(dx * reciprocal) * span));
      acc[1] = f(acc[1] + f(f(dy * reciprocal) * span));
      acc[2] = f(acc[2] + f(f(dz * reciprocal) * span));
      const remaining = f(
        f(f(f(v[0] - acc[0]) * dx) + f(f(v[1] - acc[1]) * dy)) + f(f(v[2] - acc[2]) * dz),
      );
      if (remaining >= EPSILON) return false;
      acc.set(v);
      this.states[i] = 2;
      return true;
    }
    if (!(time < duration)) {
      acc.set(v);
      this.states[i] = 2;
      return true;
    }
    const dx = f(v[0] - acc[0]);
    const dy = f(v[1] - acc[1]);
    const dz = f(v[2] - acc[2]);
    let factor = 0;
    if (duration > EPSILON) {
      switch (r.curve) {
        case 0:
          factor = f(time / duration);
          break;
        case 1:
          factor = sine(angleCode(f(f(time * 90) / duration)));
          break;
        case 2:
          factor = f(sine(angleCode(f(f(f(time * 90) / duration) + 270))) + 1);
          break;
        default:
          factor = f(Math.pow(f(time / duration), r.curve === 4 ? f(1 / r.exponent) : r.exponent));
      }
    }
    acc[0] = f(acc[0] + f(dx * factor));
    acc[1] = f(acc[1] + f(dy * factor));
    acc[2] = f(acc[2] + f(dz * factor));
    return false;
  }

  private source(node: StageNode, r: GoalRecord): Float32Array {
    const g = this.scene.graph;
    const scope = g.u32(r.at + 76);
    let first: StageNode | null = scope === 1 ? node.parent : node;
    if (scope === 2) while (first?.parent) first = first.parent;
    const id = g.u32(r.at + 72);
    const find = (start: StageNode): StageNode | null => {
      const siblings = start.parent?.children ?? [start];
      for (let i = siblings.indexOf(start); i < siblings.length; i++) {
        const current = siblings[i];
        if (current.flags & 1) continue;
        if (current.record?.id === id) return current;
        const child = current.children[0];
        const found = child ? find(child) : null;
        if (found) return found;
      }
      return null;
    };
    const target = first ? find(first) : null;
    const value = new Float32Array(4);
    if (!target) return value;
    const matrix = new Float32Array(16);
    setIdentity(matrix);
    for (let k = 0; k < 3; k++) matrix[12 + k] = g.f32(r.at + k * 4);
    const joint = g.i32(r.at + 80);
    if (joint < 0) {
      multiplyAffine(matrix, target.world, product);
      matrix.set(product);
    } else if (!this.scene.options.genericNodes && target.record) {
      const behavior = this.scene.options.nodes.get(target.record.type);
      behavior?.joint?.(target, matrix, joint, -1);
    }
    value.set(matrix.subarray(12, 15));
    return value;
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    if (!this.initialized) this.initialize(node);
    const target = this.target(node);
    if (!target) return false;
    if (this.finished) {
      if (this.mode === 1) {
        target[12] = target[13] = target[14] = 0;
        target[15] = 1;
      }
      multiplyAffine(target, this.base, product);
      target.set(product);
      multiplyAffine(scratch, this.base, product);
      scratch.set(product);
      return true;
    }
    const delta = node.delta;
    const translation = Float32Array.of(0, 0, 0, 1);
    const rotation = Float32Array.of(0, 0, 0, 1);
    const scale = Float32Array.of(1, 1, 1, 1);
    let translated = this.mode === 1;
    if (translated) {
      translation.set(target.subarray(12, 15));
      target[12] = target[13] = target[14] = 0;
      target[15] = 1;
    }
    let rotated = false;
    let scaled = false;
    let done = true;
    const current = this.current;
    current.set(this.base);
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i];
      const start = this.starts[i];
      if (start >= 0) {
        if (this.elapsed < start) {
          done = false;
          continue;
        }
        if (this.states[i] === 0) {
          this.times[i] = f(this.elapsed - start);
          this.states[i] = 1;
        }
      } else if (i > 0) {
        if (this.states[i - 1] !== 2) {
          done = false;
          continue;
        }
        if (this.states[i] === 0) {
          const carried = fraction(this.durations[i - 1]);
          if (carried > EPSILON) this.times[i] = f(delta - carried);
          else if (!this.skippedStart) this.times[i] = 0;
          this.states[i] = 1;
        }
      }
      const acc = r.channel === 0 ? translation : r.channel === 1 ? rotation : scale;
      const value =
        r.channel === 0 && r.sourced
          ? this.source(node, r)
          : this.values.subarray(i * 4, i * 4 + 4);
      if (!this.approach(i, acc, value)) done = false;
      if (r.channel === 0) translated = true;
      else if (r.channel === 1) rotated = true;
      else scaled = true;
      this.times[i] = f(this.times[i] + delta);
    }
    if (translated) {
      if (this.mode === 2) {
        const inverse = new Float32Array(16);
        inverseAffine(displayCameraMatrix(this.scene), inverse);
        const [x, y, z] = translation;
        for (let k = 0; k < 3; k++)
          translation[k] = f(
            f(f(f(inverse[k + 4] * y) + f(inverse[k] * x)) + f(inverse[k + 8] * z)) +
              inverse[k + 12],
          );
      }
      translateLocal(current, translation[0], translation[1], translation[2]);
    }
    if (rotated) {
      codes[2] = angleCode(rotation[2]);
      codes[1] = angleCode(rotation[1]);
      codes[0] = angleCode(rotation[0]);
      rotateCodes(current, codes);
    }
    if (scaled) {
      setIdentity(diagonal);
      diagonal[0] = scale[0];
      diagonal[5] = scale[1];
      diagonal[10] = scale[2];
      multiplyAffine(current, diagonal, product);
      current.set(product);
    }
    multiplyAffine(target, current, product);
    target.set(product);
    scratch.set(current);
    if (this.totalDuration >= 0 && this.elapsed >= f(this.durationOrigin + this.totalDuration)) {
      if (this.restart) done = true;
      else {
        this.finished = true;
        this.skippedStart = false;
        this.base.set(current);
      }
    }
    if (done) {
      if (this.keep) this.base.set(current);
      this.loops--;
      if (this.loopLimit < 0 || this.loops >= 0) {
        this.times.fill(0);
        this.states.fill(0);
        this.elapsed = 0;
        if (this.restart) this.begin(node);
      } else {
        this.finished = true;
        this.base.set(current);
      }
    } else this.elapsed = f(this.elapsed + delta);
    return true;
  }
}

export const goalMotion: MotionBehavior = {
  type: 106,
  create: (scene, node, record) => new GoalMotion(scene, node, record),
};
