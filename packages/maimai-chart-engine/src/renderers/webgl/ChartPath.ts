import type { FlatSubpath } from "./triangulate";

/** 滑轨缓存只保存折线。传给 WebGL 后端时保留顶点，供缩放和三角化使用。 */
export class ChartPath extends Path2D {
  readonly contours: FlatSubpath[] = [];

  get lastPoint() {
    const path = this.contours[this.contours.length - 1];
    return path?.points[path.points.length - 1];
  }

  override moveTo(x: number, y: number) {
    this.contours.push({ points: [[x, y]], closed: false });
  }

  override lineTo(x: number, y: number) {
    const path = this.contours[this.contours.length - 1];
    if (path) path.points.push([x, y]);
    else this.moveTo(x, y);
  }

  override closePath() {
    const path = this.contours[this.contours.length - 1];
    if (path) path.closed = true;
  }

  override addPath(other: ChartPath) {
    this.contours.push(...other.contours);
  }
}
