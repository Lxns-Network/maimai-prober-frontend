import {
  NODE_KILLED,
  requestState,
  requestSubtreeState,
  requestTreeState,
  type StageNode,
} from "../runtime";
import type { StageGraph } from "../graph";

export const COMMAND_BYTES = 28;

function fail(message: string): never {
  throw new RangeError(`Stage command: ${message}`);
}

/** Rejects a command whose operation and target the scene graph does not run. */
export function checkCommand(graph: StageGraph, at: number): void {
  const op = graph.u32(at);
  const target = graph.u32(at + 4);
  if (op === 1 && (target === 0 || target === 3)) return;
  if (op === 2 && (target === 0 || target === 2 || target === 3 || target === 4 || target === 5))
    return;
  fail(`operation ${op} on target ${target}`);
}

/** Stops the node's scheduled children whose record id is `id` (-1: all). */
export function stopSchedule(node: StageNode, id: number): void {
  const controller = node.controller;
  if (!controller) return;
  for (const entry of controller.schedule) if (id === -1 || entry.child.id === id) entry.flags |= 4;
}

function killChildren(node: StageNode, id: number, match: number, stop: boolean): void {
  if (!node.controller) return;
  if (stop) stopSchedule(node, id);
  for (const child of node.children) {
    const named = child.record!.id === id || id === -1;
    if (child.id === -1 ? named : named && child.id === match) child.flags |= NODE_KILLED;
  }
}

function killTree(node: StageNode, id: number, match: number, stop: boolean): void {
  killChildren(node, id, match, stop);
  for (const child of node.children) killTree(child, id, match, stop);
}

function topOf(node: StageNode): StageNode {
  let top = node;
  while (top.parent) top = top.parent;
  return top;
}

/** Runs the command record at `at` for `node`. */
export function runCommand(node: StageNode, at: number, match: number): void {
  const graph = node.scene.graph;
  checkCommand(graph, at);
  const op = graph.u32(at);
  const target = graph.u32(at + 4);
  const id = graph.i32(at + 12);
  if (op === 1) {
    const stop = graph.u32(at + 20) !== 0;
    if (target === 0) killTree(node, id, match, stop);
    else {
      if (stop) stopSchedule(node, id);
      node.flags |= NODE_KILLED;
    }
    return;
  }
  const low = graph.i32(at + 20);
  let state = graph.i32(at + 16);
  if (low >= 0) state = node.scene.random.intRange(low, state) | 0;
  switch (target) {
    case 0: {
      const first = node.children[0];
      if (first) requestTreeState(first, first, id, state, -1);
      return;
    }
    case 2: {
      const top = topOf(node);
      requestTreeState(top, top, id, state, -1);
      return;
    }
    case 3:
      requestState(node, state);
      return;
    case 4:
      requestState(node.parent!, state);
      return;
    default:
      requestSubtreeState(node, node, id, state, -1);
  }
}
