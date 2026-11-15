import type { StageNode, StageScene } from "../runtime";
import { nthElement, type MatrixElement } from "../elements";

const f = Math.fround;

/** The node's value seed: its record's seed plus its instance ordinal, or plus its birth time. */
export function nodeSeed(node: StageNode, byBirth: boolean): number {
  if (!node.record) return 0;
  const seed = node.scene.graph.u32(node.record.offset + 0x24);
  return (seed + (byBirth ? Math.trunc(node.birth) >>> 0 : node.ordinal)) >>> 0;
}

/** A record's time source: the motion's own elapsed time, the node's age, its age since its parent's start, or the parent's age. */
export function nodeClock(node: StageNode, selector: number, elapsed: number): number {
  switch (selector) {
    case 0:
      return elapsed;
    case 1:
      return node.controller ? node.controller.age : 0;
    case 2:
      return node.controller ? f(node.birth + node.controller.age) : 0;
    case 3:
      return node.parent?.controller ? node.parent.controller.age : 0;
    default:
      return 0;
  }
}

/** The matrix held by the node's `index`-th element of `type`. */
export function elementMatrix(node: StageNode, type: number, index: number): Float32Array | null {
  return nthElement<MatrixElement>(node, type, index)?.matrix ?? null;
}

/** The first live node, depth first from the top, whose record has `id`. */
export function findNodeById(scene: StageScene, id: number): StageNode | null {
  const visit = (node: StageNode): StageNode | null => {
    if (node.record && node.record.id === id && !(node.flags & 1)) return node;
    if (node.flags & 1) return null;
    for (const child of node.children) {
      const found = visit(child);
      if (found && !(found.flags & 1)) return found;
    }
    return null;
  };
  return visit(scene.top);
}
