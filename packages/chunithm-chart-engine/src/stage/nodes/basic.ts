import { applyMotions, computeWorld, NODE_VISIBLE, type NodeBehavior } from "../runtime";

/** The file root: a world matrix and no motions. */
export const rootNode: NodeBehavior = {
  type: 2,
  construct(node) {
    node.flags |= NODE_VISIBLE;
  },
  update(node) {
    computeWorld(node);
  },
  joint() {
    return false;
  },
};

/** The transform node: a world matrix, then its motion lists. */
export const nullNode: NodeBehavior = {
  type: 3,
  construct(node) {
    node.flags |= NODE_VISIBLE;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
  },
  joint() {
    return false;
  },
};
