import { describe, expect, it } from "vitest";
import { stageProviderNodes } from "./providers";

function model() {
  const node = (ref: number, name: string, parent: number, child: number, sibling: number) => ({
    ref,
    fields: {
      _name: name,
      _parent: { ref: parent },
      _child: { ref: child },
      _sibling: { ref: sibling },
    },
  });
  return {
    name: "fixture",
    nodes: [node(1, "root", 0, 3, 0), node(2, "left", 1, 0, 0), node(3, "right", 1, 0, 2)],
    shapes: [],
  };
}

describe("stage provider node order", () => {
  it("visits linked siblings, not serialized order", () => {
    expect(stageProviderNodes(model())).toEqual([0, 2, 1]);
  });

  it("retains only the first provider for repeated short names", () => {
    const shared = model();
    shared.nodes[2].fields._name = "left";
    expect(stageProviderNodes(shared)).toEqual([0, 2]);
  });

  it("rejects ambiguous, disconnected or inconsistent hierarchies", () => {
    const roots = model();
    roots.nodes[2].fields._parent = { ref: 0 };
    expect(() => stageProviderNodes(roots)).toThrow("ambiguous scene roots");

    const disconnected = model();
    disconnected.nodes[0].fields._child = { ref: 2 };
    expect(() => stageProviderNodes(disconnected)).toThrow("disconnected scene nodes");

    const cycle = model();
    cycle.nodes[1].fields._sibling = { ref: 3 };
    expect(() => stageProviderNodes(cycle)).toThrow("invalid scene hierarchy");

    const invalidParent = model();
    invalidParent.nodes[1].fields._parent = { ref: 3 };
    expect(() => stageProviderNodes(invalidParent)).toThrow("invalid scene hierarchy");
  });
});
