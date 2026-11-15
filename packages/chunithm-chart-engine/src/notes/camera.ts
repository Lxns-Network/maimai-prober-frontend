/**
 * The note layer's view-projection matrix.
 *
 * Every packed note shader reads `uViewProjection` to reach `gl_Position`, and it is not in the
 * runtime pack: the reference loads it from the scene's camera resource — a separate asset beside
 * the chart — and evaluates it against the canvas size. The scene records a camera *catalogue* (15
 * states) but the runtime selects one, so what matters here is one state's matrix at a given
 * viewport.
 *
 * The matrix is constant between states but its first entry scales with the canvas aspect ratio, so
 * it is a function of `(camera state, canvas width, canvas height)` rather than a constant. The
 * values are taken from the reference rather than re-derived: its evaluator is x87-precision camera
 * math that the reference itself only supports for constant cameras, and re-deriving it here would
 * be a second implementation of a solved problem.
 */

/**
 * A row-major 4×4 matrix, as the reference stores it.
 *
 * The camera resource's own `view`, `projection` and `viewProjection` are all recorded row-major
 * (`.bench/chunithm-p3-oracle/camera.json`), so the oracle comparison is row-major too. The renderer
 * transposes on upload, because the packed vertex stage reads `uViewProjection * vector` — the
 * column-vector convention, for which `uniformMatrix4fv` expects a sequence of columns.
 */
export type Matrix4 = Float32Array;

/**
 * One camera state's projection at one canvas size.
 *
 * `base` holds the matrix as the reference produced it for a square viewport; the reference scales
 * the first column by `height / width` when the canvas is wider than it is tall, and leaves it alone
 * otherwise. Storing the square form makes the aspect adjustment a single multiply rather than a
 * second copy of the whole matrix per size.
 */
export interface CameraTemplate {
  /** The 16 matrix floats at a square viewport. */
  readonly base: readonly number[];
  /** Entry whose value the aspect ratio scales, or -1 when no entry scales. */
  readonly aspectEntry: number;
}

/**
 * The camera the note charts are drawn with.
 *
 * Read from the reference's own evaluation of `nf_gamecamera.afb` at node 1000, state 0 — the state
 * the scene selects — at a square viewport. The oracle that produced it is
 * `.bench/chunithm-p3-oracle/camera.json`, and `cameraOracle.test.ts` checks this constant against every
 * viewport the oracle covers.
 */
export const NOTE_CAMERA: CameraTemplate = Object.freeze({
  // prettier-ignore
  base: Object.freeze([
    4.086851119995117, 0, 0, 0,
    0, 3.9319334030151367, -1.1145637035369873, -175.0793914794922,
    0, -0.27290138602256775, -0.9627354741096497, 56.915069580078125,
    0, -0.27271944284439087, -0.9620936512947083, 57.87712860107422,
  ]),
  aspectEntry: 0,
});

/**
 * The view-projection for a canvas size.
 *
 * The reference adjusts the aspect only when the canvas is wider than it is tall, which is why the
 * check is on the ratio rather than on either dimension: a square or portrait viewport keeps the
 * square form.
 *
 * The adjustment *divides* by `f32(width / height)` rather than multiplying by its reciprocal. The
 * two differ in the last bit (measured against the oracle: dividing reproduces the reference's value
 * exactly, multiplying lands one ULP high), and one ULP in the x scale reaches the clip position.
 */
export function cameraViewProjection(
  template: CameraTemplate,
  width: number,
  height: number,
  out?: Matrix4,
): Matrix4 {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new RangeError(`A canvas size must be positive and finite, got ${width}x${height}`);
  const matrix = out ?? new Float32Array(16);
  if (matrix.length !== 16)
    throw new RangeError(`A matrix is sixteen floats, got ${matrix.length}`);
  for (let i = 0; i < 16; i++) matrix[i] = Math.fround(template.base[i]);
  if (template.aspectEntry >= 0 && width > height)
    matrix[template.aspectEntry] = Math.fround(
      Math.fround(template.base[template.aspectEntry]) / Math.fround(width / height),
    );
  return matrix;
}
