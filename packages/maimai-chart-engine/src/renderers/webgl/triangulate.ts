import { tesselate, WINDING_ODD, WINDING_NONZERO } from "tess2-ts";

// canvas 路径 -> GPU 三角形的核心几何工具。
// 顶点为逻辑像素坐标（y 向下，与 canvas 2D 一致）；本文件只做几何，不涉及着色。
export type Vec2 = readonly [number, number];

export interface FlatSubpath {
  points: Vec2[];
  closed: boolean;
}

const CURVE_STEPS = 16;

/** canvas arc() 语义（y 向下）：展开为折线，最大弦高误差 maxError 像素。 */
export function flattenArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  counterclockwise: boolean = false,
  maxError: number = 0.3,
): Vec2[] {
  if (r <= 0) return [[cx, cy]];
  const tau = 2 * Math.PI;
  const delta = endAngle - startAngle;
  let sweep = delta % tau;
  if (Math.abs(delta) >= tau && (sweep === 0 || (counterclockwise ? delta < 0 : delta > 0))) {
    sweep = counterclockwise ? -tau : tau;
  } else if (counterclockwise && sweep > 0) {
    sweep -= tau;
  } else if (!counterclockwise && sweep < 0) {
    sweep += tau;
  }
  const span = Math.abs(sweep);
  const step = Math.min(Math.PI / 8, 2 * Math.acos(Math.max(-1, 1 - maxError / r)));
  const count = Math.max(1, Math.ceil(span / step));
  const points: Vec2[] = [];
  for (let i = 0; i <= count; i++) {
    const a = startAngle + (sweep * i) / count;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

/** canvas quadraticCurveTo 展开（固定细分）。 */
export function flattenQuadratic(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  steps: number = CURVE_STEPS,
): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * x0 + 2 * u * t * cx + t * t * x1,
      u * u * y0 + 2 * u * t * cy + t * t * y1,
    ]);
  }
  return points;
}

/**
 * canvas arcTo(x1,y1,x2,y2,r) 的圆弧段：从当前点 (px,py) 出发，先直线到第一切点，
 * 再沿弧到第二切点。无法构成有效弧时返回 null（调用方退化为 lineTo）。
 */
export function flattenArcTo(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
): Vec2[] | null {
  if (r <= 0) return null;
  const d1x = px - x1;
  const d1y = py - y1;
  const d2x = x2 - x1;
  const d2y = y2 - y1;
  const len1 = Math.hypot(d1x, d1y);
  const len2 = Math.hypot(d2x, d2y);
  if (len1 < 1e-9 || len2 < 1e-9) return null;
  const cosTheta = (d1x * d2x + d1y * d2y) / (len1 * len2);
  // theta = (x1→p) 与 (x1→x2) 的夹角
  const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
  const half = theta / 2;
  if (half < 1e-6 || half > Math.PI / 2 - 1e-6) return null;
  const tangentLength = r / Math.tan(half);

  const t1x = x1 + (d1x / len1) * tangentLength;
  const t1y = y1 + (d1y / len1) * tangentLength;
  const t2x = x1 + (d2x / len2) * tangentLength;
  const t2y = y1 + (d2y / len2) * tangentLength;
  const bx = d1x / len1 + d2x / len2;
  const by = d1y / len1 + d2y / len2;
  const bl = Math.hypot(bx, by);
  if (bl < 1e-9) return null;
  const centerDistance = r / Math.sin(half);
  const cxx = x1 + (bx / bl) * centerDistance;
  const cyy = y1 + (by / bl) * centerDistance;
  const a1 = Math.atan2(t1y - cyy, t1x - cxx);
  const a2 = Math.atan2(t2y - cyy, t2x - cxx);
  const cross = -d1x * d2y + d1y * d2x;
  const counterclockwise = cross < 0;
  const arcs = flattenArc(cxx, cyy, r, a1, a2, counterclockwise);
  return arcs;
}

/** 复合路径可能相交或包含孔，填充规则必须与谱面绘图命令一致。 */
export function triangulateFill(
  subpaths: FlatSubpath[],
  rule: CanvasFillRule = "nonzero",
): Float32Array {
  const contours = subpaths.filter((sub) => sub.points.length >= 3).map((sub) => sub.points.flat());
  if (!contours.length) return new Float32Array();
  const mesh = tesselate({
    contours,
    windingRule: rule === "evenodd" ? WINDING_ODD : WINDING_NONZERO,
  });
  if (!mesh) return new Float32Array();
  const triangles = new Float32Array(mesh.elements.length * 2);
  for (const [i, vertex] of mesh.elements.entries()) {
    triangles[i * 2] = mesh.vertices[vertex * 2];
    triangles[i * 2 + 1] = mesh.vertices[vertex * 2 + 1];
  }
  return triangles;
}

export function strokeOutline(
  points: Vec2[],
  closed: boolean,
  halfWidth: number,
  lineJoin: "miter" | "round" | "bevel" = "miter",
  lineCap: CanvasLineCap = "butt",
  miterLimit: number = 10,
): Vec2[] {
  if (points.length < 2 || halfWidth <= 0) return [];
  const pts = points.filter(
    (point, i) =>
      i === 0 || Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) > 1e-7,
  );
  if (pts.length < 2) return [];
  if (
    closed &&
    Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 1e-7
  )
    pts.push(pts[0]);
  const triangles: Vec2[] = [];

  if (!closed && lineCap !== "butt") {
    for (const [end, neighbor] of [
      [0, 1],
      [pts.length - 1, pts.length - 2],
    ]) {
      const point = pts[end];
      const direction = normalize(point[0] - pts[neighbor][0], point[1] - pts[neighbor][1]);
      if (lineCap === "square") {
        pts[end] = [point[0] + direction[0] * halfWidth, point[1] + direction[1] * halfWidth];
      } else {
        const angle = Math.atan2(direction[1], direction[0]);
        const arc = flattenArc(
          point[0],
          point[1],
          halfWidth,
          angle - Math.PI / 2,
          angle + Math.PI / 2,
        );
        for (let i = 1; i < arc.length; i++) triangles.push(point, arc[i - 1], arc[i]);
      }
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    const nx = (-dy / length) * halfWidth;
    const ny = (dx / length) * halfWidth;
    const a: Vec2 = [p0[0] + nx, p0[1] + ny];
    const b: Vec2 = [p0[0] - nx, p0[1] - ny];
    const c: Vec2 = [p1[0] + nx, p1[1] + ny];
    const d: Vec2 = [p1[0] - nx, p1[1] - ny];
    triangles.push(a, b, c, b, d, c);
  }

  // 接缝：第一段与最后一段在闭合时也算关节。butt 端帽下开放折线外侧天然相接。
  const joinCount = closed ? pts.length - 1 : pts.length - 2;
  for (let i = 1; i <= joinCount; i++) {
    const center = pts[i];
    const dirIn = normalize(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const nextIndex = i + 1 < pts.length ? i + 1 : i + 1 - pts.length + 1;
    const dirOut = normalize(pts[nextIndex][0] - pts[i][0], pts[nextIndex][1] - pts[i][1]);
    if (dirIn[0] === 0 && dirIn[1] === 0) continue;
    if (dirOut[0] === 0 && dirOut[1] === 0) continue;
    const cross = dirIn[0] * dirOut[1] - dirIn[1] * dirOut[0];
    if (Math.abs(cross) < 1e-9) continue;
    const nIn: Vec2 = [-dirIn[1], dirIn[0]];
    const nOut: Vec2 = [-dirOut[1], dirOut[0]];
    const miterX = nIn[0] + nOut[0];
    const miterY = nIn[1] + nOut[1];
    const miterL = Math.hypot(miterX, miterY);
    const turnSign = cross > 0 ? -1 : 1;
    const outerNIn: Vec2 = [nIn[0] * turnSign, nIn[1] * turnSign];
    const outerNOut: Vec2 = [nOut[0] * turnSign, nOut[1] * turnSign];
    const cornerA: Vec2 = [
      center[0] + outerNIn[0] * halfWidth,
      center[1] + outerNIn[1] * halfWidth,
    ];
    const cornerB: Vec2 = [
      center[0] + outerNOut[0] * halfWidth,
      center[1] + outerNOut[1] * halfWidth,
    ];

    // miter：外角伸出到交点
    if (lineJoin === "miter" && miterL > 1e-9) {
      const miterLength = halfWidth / (miterL / 2);
      if (miterLength <= halfWidth * miterLimit) {
        const tip: Vec2 = [
          center[0] + (miterX / miterL) * miterLength * turnSign,
          center[1] + (miterY / miterL) * miterLength * turnSign,
        ];
        triangles.push(center, cornerA, tip, center, tip, cornerB);
        continue;
      }
    }
    // round：外角扇形；bevel：单三角
    if (lineJoin === "round") {
      const startA = Math.atan2(cornerA[1] - center[1], cornerA[0] - center[0]);
      const endA = Math.atan2(cornerB[1] - center[1], cornerB[0] - center[0]);
      const arcs = flattenArc(center[0], center[1], halfWidth, startA, endA, cross < 0);
      for (let k = 0; k + 1 < arcs.length; k++) {
        triangles.push(center, arcs[k], arcs[k + 1]);
      }
    } else {
      triangles.push(center, cornerA, cornerB);
    }
  }
  return triangles;
}

function normalize(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  if (length < 1e-12) return [0, 0];
  return [x / length, y / length];
}
