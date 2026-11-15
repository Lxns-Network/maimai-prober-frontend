import type { StageModel } from "../pack";

const cached = new WeakMap<StageModel, readonly number[]>();

/** Maps native provider indices to the first scene node registered under each short name. */
export function stageProviderNodes(model: StageModel): readonly number[] {
  const previous = cached.get(model);
  if (previous) return previous;
  const byRef = new Map(model.nodes.map((node, index) => [node.ref, index]));
  if (
    byRef.size !== model.nodes.length ||
    model.nodes.some((node) => !Number.isSafeInteger(node.ref) || node.ref <= 0)
  )
    throw new RangeError("Stage model: invalid or duplicate node ref");
  const ref = (index: number, key: string) => {
    const value = (model.nodes[index].fields[key] as { ref?: unknown } | undefined)?.ref;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new RangeError(`Stage model: invalid node ${key}`);
    return value;
  };
  const roots: number[] = [];
  model.nodes.forEach((node, index) => {
    const name = node.fields._name;
    if (typeof name !== "string") throw new RangeError("Stage model: invalid provider name");
    if (ref(index, "_parent") === 0) roots.push(index);
  });
  if (roots.length !== 1) throw new RangeError("Stage model: ambiguous scene roots");
  const root = roots[0];
  if (ref(root, "_sibling") !== 0) throw new RangeError("Stage model: ambiguous scene roots");
  const providers: number[] = [];
  const names = new Set<string>();
  const seen = new Set<number>();
  const stack: [number, number][] = [[root, 0]];
  while (stack.length) {
    const [index, parent] = stack.pop()!;
    const node = model.nodes[index];
    if (seen.has(index) || ref(index, "_parent") !== parent)
      throw new RangeError("Stage model: invalid scene hierarchy");
    seen.add(index);
    const name = node.fields._name as string;
    if (!names.has(name)) {
      providers.push(index);
      names.add(name);
    }
    const children: number[] = [];
    const siblings = new Set<number>();
    for (let child = ref(index, "_child"); child !== 0; ) {
      const childIndex = byRef.get(child);
      if (childIndex === undefined || siblings.has(child))
        throw new RangeError("Stage model: invalid scene hierarchy");
      siblings.add(child);
      children.push(childIndex);
      child = ref(childIndex, "_sibling");
    }
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], node.ref]);
  }
  if (seen.size !== model.nodes.length)
    throw new RangeError("Stage model: disconnected scene nodes");
  cached.set(model, providers);
  return providers;
}
