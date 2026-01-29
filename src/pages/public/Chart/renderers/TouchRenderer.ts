import { BaseRenderer, RenderContext } from './BaseRenderer';
import { TouchNote, TouchHoldStartNote, Point2D, TouchPosition } from '../types';
import {
  TOUCH_SENSOR_RADII,
  TOUCH_APPROACH_MULTIPLIER,
  TOUCH_CENTER_DOT_RATIO,
  TOUCH_PETAL_OPEN_RATIO,
  TOUCH_PETAL_CLOSED_RATIO,
  NOTE_SIZE_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
} from '../utils/constants';

export class TouchRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const mirroredPosition = this.mirrorTouchPosition(touchPosition);
    const region = mirroredPosition[0];
    const sensorNum = mirroredPosition.length > 1 ? parseInt(mirroredPosition[1]) : 0;

    // 获取此区域的半径比例
    const radiusRatio = TOUCH_SENSOR_RADII[region] || 0;
    const distance = this.context.radius * radiusRatio;

    // 中心位置没有角度
    if (region === 'C') {
      return {
        x: this.context.centerX,
        y: this.context.centerY,
      };
    }

    // 根据区域和传感器编号计算角度
    let angle: number;
    if (region === 'D' || region === 'E') {
      // D/E 传感器直接与按钮位置对齐
      angle = BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP;
    } else {
      // A/B 传感器偏移半个按钮
      angle = BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;
    }

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
    };
  }

  renderTouch(
    note: TouchNote | TouchHoldStartNote,
    _currentBeat: number,
    currentTimeMs: number
  ): void {
    const isHold = note.type === 'touch-hold-start';
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getApproachTimeMs() * TOUCH_APPROACH_MULTIPLIER;

    // 计算可见窗口
    let visibilityWindow = 50;
    if (isHold && 'durationMs' in note && note.durationMs !== undefined) {
      visibilityWindow = note.durationMs + 50;
    }

    // 检查是否可见
    if (timeDiff > approachTime || timeDiff < -visibilityWindow) {
      return;
    }

    // 计算淡入 alpha
    let alpha = 1;
    if (timeDiff > approachTime * 0.95) {
      alpha = 1 - (timeDiff - approachTime * 0.95) / (approachTime * 0.05);
    }

    // 计算花瓣可见性 (淡出期间)
    let petalAlpha = 1;
    if (timeDiff > 0 && timeDiff < approachTime) {
      const remaining = approachTime - timeDiff;
      if (remaining < 150) {
        petalAlpha = remaining / 150;
      }
    }

    // 计算花瓣距离 (随着时间收敛到中心)
    const openDist = this.scaleByRadius(TOUCH_PETAL_OPEN_RATIO) * 1.1;
    const closedDist = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    let petalDist = openDist;

    if (timeDiff > 0 && timeDiff <= approachTime) {
      const progress = 1 - timeDiff / approachTime;
      const eased = progress * progress * progress * progress;
      petalDist = openDist - (openDist - closedDist) * eased;
    } else if (timeDiff <= 0) {
      petalDist = closedDist;
    }

    const position = this.getTouchPosition(note.position);
    const isSimultaneous = (note.simultaneousNoteCount ?? 0) >= 2;
    const isHoldActive = isHold && timeDiff < 0;
    const ctx = this.context.ctx;

    // 预计算循环不变量
    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const ddrColor = this.getDdrColor(note.timing);
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
    const angleOffset = isHold ? 0 : -Math.PI / 4;
    const petalColors = [
      COLORS.TOUCH_HOLD_RED,
      COLORS.TOUCH_HOLD_YELLOW,
      COLORS.TOUCH_HOLD_GREEN,
      COLORS.TOUCH_HOLD_BLUE,
    ];
    const combinedAlpha = alpha * petalAlpha;

    // 预计算所有花瓣的几何数据
    interface PetalGeometry {
      tipX: number; tipY: number;
      leftX: number; leftY: number;
      rightX: number; rightY: number;
      petalX: number; petalY: number;
      innerTipX?: number; innerTipY?: number;
      innerLeftX?: number; innerLeftY?: number;
      innerRightX?: number; innerRightY?: number;
    }
    const petals: PetalGeometry[] = [];

    for (let i = 0; i < 4; i++) {
      const petalAngle = petalBaseAngles[i] + angleOffset;
      const petalX = position.x + Math.cos(petalAngle) * petalDist;
      const petalY = position.y + Math.sin(petalAngle) * petalDist;
      const tipAngle = petalAngle + Math.PI;
      const leftAngle = petalAngle + Math.PI / 2;
      const rightAngle = petalAngle - Math.PI / 2;
      const petalSize = closedDist;

      const tipX = petalX + Math.cos(tipAngle) * petalSize;
      const tipY = petalY + Math.sin(tipAngle) * petalSize;
      const leftX = petalX + Math.cos(leftAngle) * petalSize;
      const leftY = petalY + Math.sin(leftAngle) * petalSize;
      const rightX = petalX + Math.cos(rightAngle) * petalSize;
      const rightY = petalY + Math.sin(rightAngle) * petalSize;

      const petal: PetalGeometry = { tipX, tipY, leftX, leftY, rightX, rightY, petalX, petalY };

      if (!isHold) {
        const innerRatio = 0.4;
        const cx = (tipX + leftX + rightX) / 3;
        const cy = (tipY + leftY + rightY) / 3;
        petal.innerTipX = cx + (tipX - cx) * innerRatio;
        petal.innerTipY = cy + (tipY - cy) * innerRatio;
        petal.innerLeftX = cx + (leftX - cx) * innerRatio;
        petal.innerLeftY = cy + (leftY - cy) * innerRatio;
        petal.innerRightX = cx + (rightX - cx) * innerRatio;
        petal.innerRightY = cy + (rightY - cy) * innerRatio;
      }

      petals.push(petal);
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Hold 进度指示器
    if (isHoldActive && 'durationMs' in note && note.durationMs !== undefined) {
      const elapsed = -timeDiff;
      const progress = Math.min(elapsed / note.durationMs, 1);
      
      const progressScale = 1.35;
      const progressRadius = closedDist * progressScale * 1.8;
      const squareSize = closedDist * progressScale * 1.5;
      const r = Math.min(this.scaleByRadius(25 / 300), squareSize * 0.707); // 0.707 = sqrt(2)/2
      const endAngle = -Math.PI / 2 + progress * Math.PI * 2;
      
      ctx.save();
      
      // 圆角菱形裁剪
      const offset = r * 0.707; // r / sqrt(2)
      ctx.beginPath();
      // 上角
      ctx.moveTo(position.x - offset, position.y - squareSize + offset);
      ctx.quadraticCurveTo(position.x, position.y - squareSize, position.x + offset, position.y - squareSize + offset);
      // 右角
      ctx.lineTo(position.x + squareSize - offset, position.y - offset);
      ctx.quadraticCurveTo(position.x + squareSize, position.y, position.x + squareSize - offset, position.y + offset);
      // 下角
      ctx.lineTo(position.x + offset, position.y + squareSize - offset);
      ctx.quadraticCurveTo(position.x, position.y + squareSize, position.x - offset, position.y + squareSize - offset);
      // 左角
      ctx.lineTo(position.x - squareSize + offset, position.y + offset);
      ctx.quadraticCurveTo(position.x - squareSize, position.y, position.x - squareSize + offset, position.y - offset);
      ctx.closePath();
      ctx.clip();
      
      // 圆形角度进度裁剪
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.arc(position.x, position.y, progressRadius, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.clip();
      
      // 批量绘制放大的花瓣
      const px = position.x, py = position.y;
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        ctx.beginPath();
        ctx.moveTo(px + (p.tipX - px) * progressScale, py + (p.tipY - py) * progressScale);
        ctx.lineTo(px + (p.leftX - px) * progressScale, py + (p.leftY - py) * progressScale);
        ctx.lineTo(px + (p.rightX - px) * progressScale, py + (p.rightY - py) * progressScale);
        ctx.closePath();
        ctx.fillStyle = petalColors[i];
        ctx.fill();
      }
      
      ctx.restore();
    }

    // 绘制所有花瓣的阴影层
    ctx.globalAlpha = combinedAlpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = this.scaleByRadius(8 / 300);
    ctx.shadowOffsetX = this.scaleByRadius(2 / 300);
    ctx.shadowOffsetY = this.scaleByRadius(2 / 300);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.01)'; // 透明填充，只为阴影

    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
    }
    ctx.fill();

    // 关闭阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 绘制花瓣填充
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      let fillStyle: string | CanvasGradient;

      if (ddrColor) {
        fillStyle = ddrColor;
      } else if (isHold) {
        fillStyle = petalColors[i];
      } else if (isSimultaneous) {
        const gradient = ctx.createLinearGradient(p.petalX, p.petalY, p.tipX, p.tipY);
        gradient.addColorStop(0, '#FFFF00');
        gradient.addColorStop(1, '#FFD700');
        fillStyle = gradient;
      } else {
        const gradient = ctx.createLinearGradient(p.petalX, p.petalY, p.tipX, p.tipY);
        gradient.addColorStop(0, '#00FFFF');
        gradient.addColorStop(1, '#0080FF');
        fillStyle = gradient;
      }

      ctx.beginPath();
      if (isHold) {
        this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
      } else {
        // 外形状带内孔
        this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
        this.drawRoundedTriangle(p.innerTipX!, p.innerTipY!, p.innerRightX!, p.innerRightY!, p.innerLeftX!, p.innerLeftY!, innerCornerRadius);
      }
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    // 批量绘制所有花瓣轮廓
    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();

    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      // 外轮廓
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
      // 内轮廓 (仅非 Hold)
      if (!isHold) {
        this.drawRoundedTriangle(p.innerTipX!, p.innerTipY!, p.innerLeftX!, p.innerLeftY!, p.innerRightX!, p.innerRightY!, innerCornerRadius);
      }
    }
    ctx.stroke();

    // 绘制中心点
    ctx.globalAlpha = alpha;
    const centerSize = this.scaleByRadius(TOUCH_CENTER_DOT_RATIO) * 0.8;
    ctx.beginPath();
    ctx.arc(position.x, position.y, centerSize, 0, Math.PI * 2);
    ctx.fillStyle = isSimultaneous ? '#FFFF00' : '#00BFFF';
    ctx.fill();
    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();

    // 烟花指示器
    if (note.hasFirework) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.SIMULTANEOUS_GOLD;
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', position.x, position.y);
    }

    ctx.restore();
  }

  /**
   * 渲染同时触摸的边框
   */
  renderTouchBorder(
    note: TouchNote | TouchHoldStartNote,
    position: Point2D,
    isSimultaneous: boolean
  ): void {
    if (!note.visibleTouchCount || note.visibleTouchCount < 2) {
      return;
    }

    const boxSize = this.scaleByRadius(1 / 4.46) * 1.1 * 1.2;
    const cornerRadius = this.scaleByRadius(NOTE_SIZE_RATIO);
    const color = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TOUCH_CYAN;

    // 绘制更大的边框用于 3+ 触摸
    if (note.visibleTouchCount >= 3) {
      const largerSize = boxSize * 1.2;
      this.drawTouchBorderBox(position.x, position.y, largerSize, cornerRadius, color, 3);
    }

    this.drawTouchBorderBox(position.x, position.y, boxSize, cornerRadius, color, 3);
  }

  /**
   * 绘制圆角边框框
   */
  private drawTouchBorderBox(
    x: number,
    y: number,
    size: number,
    cornerRadius: number,
    color: string,
    lineWidth: number
  ): void {
    const half = size / 2;
    const left = x - half;
    const top = y - half;
    const gap = size * 0.3;
    const ctx = this.context.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * this.context.radius / 300;
    ctx.beginPath();

    // 上边缘左半部分
    ctx.moveTo(left + cornerRadius, top);
    ctx.lineTo(left + size / 2 - gap / 2, top);

    // 上边缘右半部分 + 右上角
    ctx.moveTo(left + size / 2 + gap / 2, top);
    ctx.lineTo(left + size - cornerRadius, top);
    ctx.arcTo(left + size, top, left + size, top + cornerRadius, cornerRadius);

    // 右边缘上半部分
    ctx.lineTo(left + size, top + size / 2 - gap / 2);

    // 右边缘下半部分 + 右下角
    ctx.moveTo(left + size, top + size / 2 + gap / 2);
    ctx.lineTo(left + size, top + size - cornerRadius);
    ctx.arcTo(left + size, top + size, left + size - cornerRadius, top + size, cornerRadius);

    // 下边缘右半部分
    ctx.lineTo(left + size / 2 + gap / 2, top + size);

    // 下边缘左半部分 + 左下角
    ctx.moveTo(left + size / 2 - gap / 2, top + size);
    ctx.lineTo(left + cornerRadius, top + size);
    ctx.arcTo(left, top + size, left, top + size - cornerRadius, cornerRadius);

    // 左边缘下半部分
    ctx.lineTo(left, top + size / 2 + gap / 2);

    // 左边缘上半部分 + 左上角
    ctx.moveTo(left, top + size / 2 - gap / 2);
    ctx.lineTo(left, top + cornerRadius);
    ctx.arcTo(left, top, left + cornerRadius, top, cornerRadius);

    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制圆角三角形
   */
  private drawRoundedTriangle(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    cornerRadius: number
  ): void {
    if (cornerRadius <= 0) {
      const ctx = this.context.ctx;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      return;
    }

    const vertices = [
      { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } },
      { from: { x: x2, y: y2 }, to: { x: x3, y: y3 } },
      { from: { x: x3, y: y3 }, to: { x: x1, y: y1 } },
    ];

    const ctx = this.context.ctx;

    for (let i = 0; i < 3; i++) {
      const prevEdge = vertices[(i + 2) % 3];
      const currEdge = vertices[i];
      const corner = currEdge.from;

      // 从上一个顶点到角的方向
      const dx1 = corner.x - prevEdge.from.x;
      const dy1 = corner.y - prevEdge.from.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      // 从角到下一个顶点的方向
      const dx2 = currEdge.to.x - corner.x;
      const dy2 = currEdge.to.y - corner.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const nx1 = dx1 / len1;
      const ny1 = dy1 / len1;
      const nx2 = dx2 / len2;
      const ny2 = dy2 / len2;

      const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

      // 角之前的点和角之后的点
      const beforeX = corner.x - nx1 * r;
      const beforeY = corner.y - ny1 * r;
      const afterX = corner.x + nx2 * r;
      const afterY = corner.y + ny2 * r;

      if (i === 0) {
        ctx.moveTo(beforeX, beforeY);
      } else {
        ctx.lineTo(beforeX, beforeY);
      }

      ctx.quadraticCurveTo(corner.x, corner.y, afterX, afterY);
    }

    ctx.closePath();
  }
}

export default TouchRenderer;
