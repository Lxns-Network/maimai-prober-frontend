export interface ColorSnapshot {
  readonly binding: { readonly texture: WebGLTexture; readonly sampler: WebGLSampler };
  /** Copies the current framebuffer's viewport to an independent, lower-left color image. */
  capture(): void;
  dispose(): void;
}

export function createColorSnapshot(gl: WebGL2RenderingContext): ColorSnapshot {
  const texture = gl.createTexture()!;
  const sampler = gl.createSampler()!;
  const target = gl.createFramebuffer()!;
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let width = 0;
  let height = 0;
  let format = 0;
  return {
    binding: { texture, sampler },
    capture() {
      const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
      const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const previous = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      const scissor = gl.isEnabled(gl.SCISSOR_TEST);
      const nextFormat =
        framebuffer &&
        gl.getFramebufferAttachmentParameter(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
        ) === gl.FLOAT
          ? gl.RGBA16F
          : gl.RGBA8;
      try {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (viewport[2] !== width || viewport[3] !== height || format !== nextFormat) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            nextFormat,
            viewport[2],
            viewport[3],
            0,
            gl.RGBA,
            nextFormat === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
            null,
          );
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target);
          gl.framebufferTexture2D(
            gl.DRAW_FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
          );
          if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error("Scene color snapshot framebuffer is incomplete");
          width = viewport[2];
          height = viewport[3];
          format = nextFormat;
        }
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target);
        gl.disable(gl.SCISSOR_TEST);
        gl.blitFramebuffer(
          viewport[0],
          viewport[1],
          viewport[0] + width,
          viewport[1] + height,
          0,
          0,
          width,
          height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      } finally {
        gl.bindTexture(gl.TEXTURE_2D, previous);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
        if (scissor) gl.enable(gl.SCISSOR_TEST);
      }
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteSampler(sampler);
      gl.deleteFramebuffer(target);
    },
  };
}
