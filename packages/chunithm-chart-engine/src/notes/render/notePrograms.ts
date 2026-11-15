/**
 * Note shader preparation: turning the packed programs into instanced variants.
 *
 * The packed shaders read the world transform from a `uWorld` uniform, one draw per note. Instancing
 * moves that transform to a vertex attribute so a whole group draws in one call, which means the
 * shader source has to be rewritten by textual substitution on the declaration rather than by shipping
 * a second hand-written copy. A hand-written copy would have to be kept in step with the exported
 * source, and a drift there is a pixel difference that neither the build nor the tests would catch.
 *
 * Only `uWorld` travels per instance. The other per-note-looking values (`uDiffuse`, `uUvOffsetScale`)
 * are declared in the *fragment* stage by every packed program, so they cannot become vertex
 * attributes at all; they stay per-draw uniforms. Routing them through a flat varying would work in
 * principle, but it would change interpolation for values the reference passes as uniforms, so it is
 * deliberately not done.
 *
 * Attributes are bound by name, so the rewrite renames as well as re-declares: an attribute the
 * compiler finds unused is dropped and reads back as location -1, and a uniform left under its own
 * name would never be found at all. Either way nothing is bound and the layout shifts silently.
 *
 * A shader that cannot be rewritten safely is reported rather than patched: the caller then falls
 * back to one draw per note, which is slower but correct.
 */

/** A packed shader: vertex and fragment source joined by a NUL byte. */
const SHADER_SEPARATOR = "\0";

/** Splits a packed shader entry into its two stages. */
export function splitShader(bytes: Uint8Array): { vertex: string; fragment: string } {
  const text = new TextDecoder().decode(bytes);
  const at = text.indexOf(SHADER_SEPARATOR);
  if (at < 0) throw new RangeError("A packed shader must hold a vertex and a fragment stage");
  return { vertex: text.slice(0, at), fragment: text.slice(at + 1) };
}

/**
 * Attributes an instanced variant declares, in the order the instance buffer lays them out.
 *
 * Only the world matrix travels as an attribute. The tint and the UV offset are declared in the
 * fragment stage by every packed program, so they stay per-draw uniforms and are not listed here;
 * listing them would make the layout bind four names that no shader declares.
 */
export const INSTANCED_ATTRIBUTES = Object.freeze([
  "aInstanceWorld0",
  "aInstanceWorld1",
  "aInstanceWorld2",
  "aInstanceWorld3",
] as const);

/** Per-instance float count the shader reads: the twelve world-matrix floats. */
export const INSTANCED_FLOATS = 12;

/** Strips comments so a name mentioned only in a comment is not mistaken for a use. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (comment) => comment.replace(/[^\r\n]/g, " "));

/** Whether a fragment stage declares the UV transform its material must supply. */
export function declaresUvTransform(fragment: string): boolean {
  return /\buniform\s+vec4\s+uUvOffsetScale\b/.test(withoutComments(fragment));
}

/**
 * Rewrites a program into its instanced variant.
 *
 * `uWorld` must be declared exactly once as a `mat4` uniform in the vertex stage. A shader that reads
 * it in the fragment stage, or that depends on the instance id, is rejected: neither can be expressed
 * through vertex attributes.
 */
export function instancedShader(
  vertex: string,
  fragment: string,
): { vertex: string; fragment: string } | undefined {
  const visibleVertex = withoutComments(vertex);
  const visibleFragment = withoutComments(fragment);
  if (!/^\s*#version\s+300\s+es\b/.test(visibleVertex)) return undefined;
  if (/\b(?:gl_InstanceID|gl_DrawID)\b/.test(visibleFragment)) return undefined;
  if (/\b(?:gl_InstanceID|gl_DrawID)\b/.test(visibleVertex)) return undefined;
  if (/^\s*#\s*define\b.*\buWorld\b/m.test(visibleVertex)) return undefined;
  // A fragment-stage uWorld would have to become a varying, which changes interpolation.
  if (/\buWorld\b/.test(visibleFragment)) return undefined;

  const declarations = [
    ...visibleVertex.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?mat4\s+uWorld\s*;/g),
  ];
  if (declarations.length !== 1) return undefined;
  const declaration = declarations[0];

  return {
    vertex:
      vertex.slice(0, declaration.index) +
      // Four vec3 slots rather than a mat4 attribute: mat4 attributes are not portable across the
      // matrix layout rules, while four explicit columns are.
      //
      // The slots are vec3 because the transform is affine: the matrix's last row is (0, 0, 0, 1)
      // and the buffer stores only the three rows the note transform has. A vec4 slot would take
      // the missing component as 1.0, which puts (1, 1, 1, 1) in the last row and makes the clip `w`
      // a function of the position — the geometry then sits behind a `w` that passes through zero.
      "in vec3 aInstanceWorld0;\nin vec3 aInstanceWorld1;\nin vec3 aInstanceWorld2;\nin vec3 aInstanceWorld3;\n" +
      "#define uWorld mat4(vec4(aInstanceWorld0, 0.0), vec4(aInstanceWorld1, 0.0), " +
      "vec4(aInstanceWorld2, 0.0), vec4(aInstanceWorld3, 1.0))\n" +
      vertex.slice(declaration.index + declaration[0].length),
    fragment,
  };
}

/**
 * Names of the `vec4` uniforms a vertex stage declares, excluding `uWorld`.
 *
 * Every packed note program declares its `vec4` values in the fragment stage, so this returns an
 * empty list for all of them. It is kept because the renderer's per-draw path needs the same list for
 * other program families, and because a shader that did declare them would have to be handled.
 */
export function vectorUniformNames(vertex: string): string[] {
  return [
    ...withoutComments(vertex).matchAll(
      /\buniform\s+(?:(?:highp|mediump|lowp)\s+)?vec4\s+(u[A-Za-z0-9_]+)\s*;/g,
    ),
  ].map((match) => match[1]);
}
