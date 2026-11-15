import type { FrameDepth } from "../render/frameTypes";

export interface DepthSnapshot {
  readonly binding: FrameDepth;
  /** Copies a lower-left source rectangle into a viewport-local depth texture. */
  capture(
    source?: WebGLFramebuffer | null,
    width?: number,
    height?: number,
    x?: number,
    y?: number,
  ): void;
  dispose(): void;
}

export function createDepthSnapshot(gl: WebGL2RenderingContext): DepthSnapshot {
  const texture = gl.createTexture();
  const sampler = gl.createSampler();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !sampler || !framebuffer) {
    gl.deleteTexture(texture);
    gl.deleteSampler(sampler);
    gl.deleteFramebuffer(framebuffer);
    throw new Error("深度快照资源无法创建");
  }
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // ANGLE can return zero for non-comparison depth reads with linear filtering.
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  let width = 0;
  let height = 0;
  let disposed = false;
  return {
    binding: { texture, sampler },
    capture(
      source = null,
      sourceWidth = gl.canvas.width,
      sourceHeight = gl.canvas.height,
      sourceX = 0,
      sourceY = 0,
    ) {
      if (disposed) throw new Error("深度快照已释放");
      const nextWidth = sourceWidth;
      const nextHeight = sourceHeight;
      if (nextWidth <= 0 || nextHeight <= 0) throw new RangeError("深度快照需要非空画布");
      const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      const scissor = gl.isEnabled(gl.SCISSOR_TEST);
      const resized = width !== nextWidth || height !== nextHeight;
      const previousTexture = resized ? gl.getParameter(gl.TEXTURE_BINDING_2D) : null;
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, source);
        if (resized) {
          if (gl.getParameter(gl.DEPTH_BITS) !== 24 || gl.getParameter(gl.STENCIL_BITS) !== 8)
            throw new Error("深度快照需要 D24S8 源缓冲");
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.DEPTH24_STENCIL8,
            nextWidth,
            nextHeight,
            0,
            gl.DEPTH_STENCIL,
            gl.UNSIGNED_INT_24_8,
            null,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        }
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
        if (resized) {
          gl.framebufferTexture2D(
            gl.DRAW_FRAMEBUFFER,
            gl.DEPTH_STENCIL_ATTACHMENT,
            gl.TEXTURE_2D,
            texture,
            0,
          );
          gl.drawBuffers([gl.NONE]);
          if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error("深度快照帧缓冲不完整");
          width = nextWidth;
          height = nextHeight;
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.blitFramebuffer(
          sourceX,
          sourceY,
          sourceX + width,
          sourceY + height,
          0,
          0,
          width,
          height,
          gl.DEPTH_BUFFER_BIT,
          gl.NEAREST,
        );
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read as WebGLFramebuffer | null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw as WebGLFramebuffer | null);
        if (resized) gl.bindTexture(gl.TEXTURE_2D, previousTexture as WebGLTexture | null);
        if (scissor) gl.enable(gl.SCISSOR_TEST);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.deleteSampler(sampler);
    },
  };
}
