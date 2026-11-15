/**
 * The instance attribute layout, as data.
 *
 * The shader reads four `vec4` slots holding the world matrix, and the buffer lays the same twelve
 * floats out per instance. The two must agree exactly: an off-by-one in an offset makes an instance
 * read its neighbour's transform, which shows up as a few notes in the wrong place rather than as an
 * error.
 *
 * The layout is described here as data and applied by one function, so the description can be checked
 * without a GL context.
 */

import { INSTANCED_ATTRIBUTES, INSTANCED_FLOATS } from "./notePrograms";

/** Component size every instance attribute uses. */
export const ATTRIBUTE_COMPONENTS = 4;
/** Bytes per component. */
const COMPONENT_BYTES = 4;

export interface AttributeLayout {
  /** Attribute name, in the order the shader declares them. */
  name: string;
  /** Components per vertex for this attribute. */
  size: number;
  /** Byte offset within one instance. */
  offset: number;
}

/**
 * The layout, derived from the attribute count so it cannot drift from the buffer's stride.
 *
 * The matrix takes the first four slots, then the tint, then the UV pair — which is the order
 * {@link INSTANCED_ATTRIBUTES} declares and the order the buffer writes.
 */
export function instanceAttributeLayout(): AttributeLayout[] {
  // The world matrix is twelve floats, so its four slots hold three each; the tint and the UV pair
  // take a full vec4. Deriving sizes from the names rather than assuming they are all vec4 is what
  // keeps the total equal to the stride.
  const sizes = INSTANCED_ATTRIBUTES.map((name) =>
    name.startsWith("aInstanceWorld") ? 3 : ATTRIBUTE_COMPONENTS,
  );
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (INSTANCED_FLOATS !== total)
    throw new RangeError(
      `Instance stride ${INSTANCED_FLOATS} does not match ${total} components across ` +
        `${INSTANCED_ATTRIBUTES.length} attributes`,
    );
  let offset = 0;
  return INSTANCED_ATTRIBUTES.map((name, index) => {
    const attribute = { name, size: sizes[index], offset };
    offset += sizes[index] * COMPONENT_BYTES;
    return attribute;
  });
}

/** Bytes per instance, which is the stride every attribute shares. */
export function instanceStrideBytes(): number {
  return INSTANCED_FLOATS * COMPONENT_BYTES;
}

/** The subset of a GL context this layout needs, so a fake can stand in for tests. */
export interface LayoutTarget {
  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void;
  enableVertexAttribArray(index: number): void;
  vertexAttribDivisor(index: number, divisor: number): void;
}

/**
 * Applies the layout to `locations`, the attribute slot for each name.
 *
 * Every attribute advances once per instance rather than once per vertex, which is what makes one
 * draw cover a whole group. A negative location means the shader optimized the attribute away; that
 * is a mismatch between the shader and the buffer, so it throws rather than binding a shifted layout.
 */
export function applyInstanceLayout(
  gl: LayoutTarget,
  locations: readonly number[],
  floatType: number,
): void {
  const layout = instanceAttributeLayout();
  if (locations.length !== layout.length)
    throw new RangeError(
      `Instance layout has ${layout.length} attributes but ${locations.length} locations were given`,
    );
  const stride = instanceStrideBytes();
  layout.forEach((attribute, index) => {
    const location = locations[index];
    if (!Number.isInteger(location) || location < 0)
      throw new RangeError(`Attribute ${attribute.name} is not active in the program`);
    gl.vertexAttribPointer(location, attribute.size, floatType, false, stride, attribute.offset);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribDivisor(location, 1);
  });
}
