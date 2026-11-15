import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement } from "../elements";
import type { AnimationElement } from "../model/animationElement";
import "../model/animationElement";
import { CameraElement } from "../model/cameraElement";
import { cvuFrameCount } from "../model/cvu";
import { SEEDED_TABLE } from "../random";
import { nodeSeed } from "./common";
import { multiplyAffine, rotateCodes, setIdentity } from "../../math/matrix";
import { atan2Float32 } from "../camera/arctangent";
import { checkCommand, COMMAND_BYTES, runCommand } from "./commands";

const f = Math.fround;
const ANIMATION_ELEMENT = 400;
const UV_ELEMENT = 402;
const RECORD_BYTES = 92;
const KIND_ANIMATION = 0;
const KIND_CAMERA = 1;
const KIND_UV = 3;
const SELECT_SEQUENTIAL = 0;
const SELECT_RANDOM = 1;
const SELECT_HOLD = 2;
const PICK_RANDOM = 2;
const UNSET = -1;
const BY_ORDINAL = -2;
const ANGLE_CODES_PER_RADIAN = f(10430.378);
const RECORD_DEGREES_TO_CODE = 182;
const product = new Float32Array(16);
const axisCodes = new Int32Array(3);

function fail(message: string): never {
  throw new RangeError(`Stage motion set: ${message}`);
}

/** Plays a list of animation records on the node's animation component: frame, loops and the move to the next record. */
class MotionSet implements MotionInstance {
  readonly data: number;
  readonly kind: number;
  readonly mode: number;
  readonly selectionSource: number;
  readonly matrixJoint: number;
  readonly matrix = new Float32Array(16);
  readonly records: number;
  readonly recordCount: number;
  /** The animation component that plays, by receiver kind. */
  readonly receiver: AnimationElement | CameraElement | null;
  readonly primary: AnimationElement | null;
  readonly camera: CameraElement | null;
  /** Position in the record list. */
  recordIndex = 0;
  /** Passes over the record list that are left. */
  passes: number;
  /** The record that plays, or -1 before the first. */
  current = -1;
  phase = 0;
  lower = 0;
  upper = 0;
  /** Loops of the record that are left: zero plays it once, below zero without end. */
  loops = 0;
  holdLoop = 0;
  holdEnd = 0;
  rate = 0;
  readonly parameters = Float32Array.of(-1, -1, -1, -1, -1);
  initialized = false;
  finished = false;
  readonly blendEnabled: boolean;
  readonly blendRate: number;
  blending = false;
  blendWeight = 0;
  blendSource = -1;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
    readonly behavior: MotionBehavior,
    readonly ordinalSelect: boolean,
  ) {
    const g = scene.graph;
    if (record.data === null) fail("motion without data");
    this.data = record.data;
    this.kind = g.i32(this.data);
    this.mode = g.i32(this.data + 4);
    this.selectionSource = g.i32(this.data + 12);
    this.matrixJoint = g.i32(this.data + 24);
    setIdentity(this.matrix);
    this.passes = g.i32(this.data + 8);
    this.recordCount = g.i32(this.data + 28);
    if (this.recordCount <= 0) fail("no records");
    this.records = g.target(this.data + 32);
    if (this.kind !== KIND_ANIMATION && this.kind !== KIND_CAMERA && this.kind !== KIND_UV)
      fail(`receiver kind ${this.kind}`);
    this.blendEnabled = g.u32(this.data + 16) !== 0;
    const blendFrames = g.i32(this.data + 20);
    this.blendRate = blendFrames > 0 ? f(1 / blendFrames) : 0;
    if (
      this.mode < SELECT_SEQUENTIAL ||
      this.mode > SELECT_HOLD ||
      (this.mode !== SELECT_SEQUENTIAL &&
        (this.selectionSource < 0 || this.selectionSource > PICK_RANDOM))
    )
      fail(`record selection ${this.mode}/${this.selectionSource}`);
    for (let i = 0; i < this.recordCount; i++) this.check(this.records + i * RECORD_BYTES);
    this.primary = motionElement<AnimationElement>(node, record, ANIMATION_ELEMENT);
    this.camera = motionElement<CameraElement>(node, record, 600);
    this.receiver =
      this.kind === KIND_CAMERA
        ? this.camera
        : this.kind === KIND_UV
          ? motionElement<AnimationElement>(node, record, UV_ELEMENT)
          : this.primary;
    if (!scene.options.genericNodes) {
      if (this.receiver && this.receiver.count > 0 && !scene.options.animation)
        fail("animation resources are not available");
    }
  }

  setParameter(index: number, value: number): void {
    if (index >= this.parameters.length) return;
    this.parameters[index] = value;
    if (index === 2) this.rate = this.parameters[2];
  }

  private check(at: number): void {
    const g = this.scene.graph;
    if (g.u32(at + 44) > 7 || g.u32(at + 60) > 6) fail("record transform mode");
    if (g.u32(at + 80) !== 0) {
      const commands = g.target(at + 84);
      for (let i = 0; i < g.i32(at + 88); i++) checkCommand(g, commands + i * COMMAND_BYTES);
    }
  }

  private frameCount(): number {
    const receiver = this.receiver;
    if (receiver instanceof CameraElement) return receiver.animation()?.lastFrame ?? 0;
    const resolve = this.scene.options.animation;
    if (!receiver || !resolve || receiver.index >= receiver.count) return 0;
    const bytes = resolve(receiver.ordinals[receiver.index]);
    if (!bytes) fail("animation resource is not a container");
    const frames = cvuFrameCount(bytes);
    return receiver.type === ANIMATION_ELEMENT ? frames : frames - 1;
  }

  /** Runs the commands of the record that just ended, then moves to the next record or finishes. */
  private next(node: StageNode): void {
    const g = this.scene.graph;
    if (this.initialized) {
      const ended = this.records + this.current * RECORD_BYTES;
      if (g.u32(ended + 80) !== 0) {
        const commands = g.target(ended + 84);
        for (let i = 0; i < g.i32(ended + 88); i++)
          runCommand(node, commands + i * COMMAND_BYTES, -1);
      }
    }
    if (this.mode === SELECT_RANDOM || (this.mode === SELECT_HOLD && !this.initialized))
      this.recordIndex =
        this.selectionSource === PICK_RANDOM
          ? this.scene.random.intBelow(this.recordCount - 1)
          : SEEDED_TABLE[nodeSeed(node, this.selectionSource === 1) & 0xff] % this.recordCount;
    else if (this.initialized) {
      if (this.recordIndex === this.recordCount - 1) {
        if (this.passes === 0) {
          this.finished = true;
          this.primary?.finish();
          this.camera?.finish();
          return;
        }
        if (this.passes > 0) this.passes--;
        this.recordIndex = 0;
      } else this.recordIndex++;
    }
    if (this.initialized && this.matrixJoint >= 0) this.accumulate(node);
    this.begin(node);
  }

  private begin(node: StageNode): void {
    const g = this.scene.graph;
    const random = this.scene.random;
    const at = this.records + this.recordIndex * RECORD_BYTES;
    this.blendSource = g.f32(
      this.records + (this.current >= 0 ? this.current : 0) * RECORD_BYTES + 76,
    );
    this.blending = this.blendEnabled;
    this.blendWeight = 0;
    this.current = this.recordIndex;
    const receiver = this.receiver;
    const selection = this.parameters[0];
    let animation = selection === UNSET ? g.i32(at) : Math.trunc(selection);
    if (selection === UNSET && animation === UNSET)
      animation = receiver && receiver.count > 0 ? random.intBelow(receiver.count - 1) : 0;
    if (selection === UNSET && animation === BY_ORDINAL && this.ordinalSelect)
      animation = node.ordinal;
    if (receiver instanceof CameraElement) receiver.select(animation);
    else
      receiver?.select(
        animation,
        this.kind === KIND_UV
          ? UNSET
          : this.parameters[1] === UNSET
            ? g.i32(at + 4)
            : Math.trunc(this.parameters[1]),
      );
    this.rate = g.f32(at + 8);
    this.parameters[2] = this.rate;
    const frames = this.frameCount();
    const start = this.parameters[3] === UNSET ? g.f32(at + 12) : this.parameters[3];
    const end = this.parameters[4] === UNSET ? g.f32(at + 16) : this.parameters[4];
    const fromStart = g.u32(at + 40) === 0;
    if (this.rate < 0) {
      this.phase = start;
      if (this.phase < 0) this.phase = frames;
      this.lower = fromStart ? this.phase : frames;
      this.upper = this.parameters[4] === UNSET && end < 0 ? 0 : end;
    } else {
      this.phase = start !== UNSET ? start : f(random.floatRange(0, frames));
      if (this.phase < 0) this.phase = 0;
      this.lower = fromStart ? this.phase : 0;
      this.upper = this.parameters[4] === UNSET && end < 0 ? frames : end;
    }
    this.loops = g.i32(at + 20);
    this.holdLoop = g.f32(at + 32);
    this.holdEnd = g.f32(at + 36);
    if (g.u32(at + 28) !== 0 && this.loops < 0) {
      this.loops = 0;
      this.phase = this.upper;
    }
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    const delta = node.delta;
    if (!this.finished) {
      if (this.initialized) this.phase = f(this.phase + f(this.rate * delta));
      else {
        this.next(node);
        this.initialized = true;
      }
      if (this.loops === 0) this.once(node, delta);
      else this.loop(node, delta);
      this.receiver?.setFrame(this.phase);
    }
    for (const target of [node.world, scratch]) {
      multiplyAffine(target, this.matrix, product);
      target.set(product);
    }
    this.primary?.resume();
    if (this.primary) {
      this.primary.blending = this.blending;
      if (this.blending) {
        this.primary.blendSource = this.blendSource;
        this.primary.blendWeight = this.blendWeight;
        this.blendWeight = f(this.blendWeight + f(this.blendRate * delta));
        if (this.blendWeight > 1) {
          this.primary.blending = false;
          this.blending = false;
        }
      }
    }
    return true;
  }

  dispose(): void {
    this.primary?.pause();
  }

  private once(node: StageNode, delta: number): void {
    if (this.rate < 0) {
      if (this.upper <= this.phase) return;
    } else if (this.phase <= this.upper && this.lower !== this.upper) return;
    this.phase = this.upper;
    if (this.holdEnd <= 0) {
      if (this.mode !== SELECT_HOLD) this.next(node);
    } else this.holdEnd = f(this.holdEnd - delta);
  }

  private loop(node: StageNode, delta: number): void {
    const span = Math.abs(f(this.upper - this.lower));
    if (this.rate < 0) {
      if (this.upper <= this.phase) return;
    } else if (!(this.phase > this.upper)) return;
    if (this.holdLoop > 0) {
      this.phase = this.upper;
      this.holdLoop = f(this.holdLoop - delta);
      return;
    }
    if (this.rate >= 0 && this.matrixJoint >= 0) this.accumulate(node);
    this.phase = this.rate < 0 ? f(span + this.phase) : f(this.phase - span);
    if (this.loops > 0) this.loops--;
    this.holdLoop = this.scene.graph.f32(this.records + this.current * RECORD_BYTES + 32);
  }

  private accumulate(node: StageNode): void {
    if (node.record && !this.scene.options.genericNodes)
      this.scene.options.nodes
        .get(node.record.type)
        ?.joint?.(node, this.matrix, this.matrixJoint, -1);
    const g = this.scene.graph;
    const at = this.records + this.current * RECORD_BYTES;
    const positionMode = g.u32(at + 44);
    const rotationMode = g.u32(at + 60);
    if (positionMode === 0 && rotationMode === 0) return;
    const x = f(f(f(this.matrix[0] + this.matrix[4]) * 0) + f(this.matrix[8] * 100));
    const y = f(f(f(this.matrix[1] + this.matrix[5]) * 0) + f(this.matrix[9] * 100));
    const z = f(f(f(this.matrix[2] + this.matrix[6]) * 0) + f(this.matrix[10] * 100));
    const yaw = Math.trunc(f(atan2Float32(x, z) * ANGLE_CODES_PER_RADIAN));
    const pitch = Math.trunc(
      f(atan2Float32(y, f(Math.sqrt(f(f(z * z) + f(x * x))))) * -ANGLE_CODES_PER_RADIAN),
    );
    axisCodes.fill(0);
    if (rotationMode !== 0) {
      axisCodes[0] =
        rotationMode === 2 || rotationMode === 3 || rotationMode === 6
          ? pitch
          : Math.trunc(f(g.f32(at + 64) * RECORD_DEGREES_TO_CODE));
      axisCodes[1] =
        rotationMode === 1 || rotationMode === 3 || rotationMode === 5
          ? yaw
          : Math.trunc(f(g.f32(at + 68) * RECORD_DEGREES_TO_CODE));
      axisCodes[2] =
        rotationMode <= 2 || rotationMode === 4
          ? 0
          : Math.trunc(f(g.f32(at + 72) * RECORD_DEGREES_TO_CODE));
      rotateCodes(this.matrix, axisCodes);
    }
    if (positionMode === 0 || positionMode === 1 || positionMode === 4 || positionMode === 5)
      this.matrix[12] = g.f32(at + 48);
    if (positionMode === 0 || positionMode === 2 || positionMode === 4 || positionMode === 6)
      this.matrix[13] = g.f32(at + 52);
    if (positionMode === 0 || positionMode === 3 || positionMode === 5 || positionMode === 6)
      this.matrix[14] = g.f32(at + 56);
  }
}

export const motionSetMotion: MotionBehavior = {
  type: 600,
  create: (scene, node, record) => new MotionSet(scene, node, record, motionSetMotion, false),
};

export const cameraMotionSetMotion: MotionBehavior = {
  type: 6000002,
  create: (scene, node, record) => new MotionSet(scene, node, record, cameraMotionSetMotion, true),
};

/** The motion set that can also pick the animation by the node's instance ordinal. */
export const ordinalMotionSetMotion: MotionBehavior = {
  type: 6000003,
  create: (scene, node, record) => new MotionSet(scene, node, record, ordinalMotionSetMotion, true),
};
