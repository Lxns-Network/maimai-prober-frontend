/** Target size after the reflection scene divides and bounds the main scene dimensions. */
export function stageReflectionSize(
  width: number,
  height: number,
  sizeMode: number,
  customWidth = width,
  customHeight = height,
) {
  const bound = (dimension: number) => Math.max(16, Math.min(8192, Math.trunc(dimension)));
  return sizeMode === 0
    ? ([bound(customWidth), bound(customHeight)] as const)
    : ([bound(width / sizeMode), bound(height / sizeMode)] as const);
}

/** Main viewport changes alone do not invalidate the reflection scene's size properties. */
export function createStageReflectionSizing() {
  let state: {
    readonly mode: number;
    readonly customWidth: number;
    readonly customHeight: number;
    readonly size: readonly [number, number];
  } | null = null;
  return {
    update(width: number, height: number, mode: number, customWidth: number, customHeight: number) {
      if (
        !state ||
        mode !== state.mode ||
        customWidth !== state.customWidth ||
        customHeight !== state.customHeight
      ) {
        state = {
          mode,
          customWidth,
          customHeight,
          size: stageReflectionSize(width, height, mode, customWidth, customHeight),
        };
      }
      return state.size;
    },
    reset() {
      state = null;
    },
  };
}

/** A colour and depth target reused by successive reflection frames. */
export function createStageReflectionTarget(gl: WebGL2RenderingContext) {
  let texture: WebGLTexture | null = null;
  let framebuffer: WebGLFramebuffer | null = null;
  let depth: WebGLRenderbuffer | null = null;
  let width = 0;
  let height = 0;
  let hdr = false;
  const release = () => {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(depth);
    texture = null;
    framebuffer = null;
    depth = null;
    width = height = 0;
  };
  return {
    begin(w: number, h: number, requestHdr = false): WebGLTexture {
      // A texture cannot remain bound for sampling while attached to the active framebuffer.
      gl.activeTexture(gl.TEXTURE0 + 7);
      gl.bindTexture(gl.TEXTURE_2D, null);
      if (!texture || width !== w || height !== h || hdr !== requestHdr) {
        if (requestHdr && !gl.getExtension("EXT_color_buffer_float"))
          throw new Error("Stage reflection: half-float render targets are unavailable");
        release();
        try {
          texture = gl.createTexture();
          framebuffer = gl.createFramebuffer();
          depth = gl.createRenderbuffer();
          if (!texture || !framebuffer || !depth)
            throw new Error("Stage reflection: target allocation failed");
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texStorage2D(gl.TEXTURE_2D, 1, requestHdr ? gl.RGBA16F : gl.RGBA8, w, h);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
          gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_STENCIL_ATTACHMENT,
            gl.RENDERBUFFER,
            depth,
          );
          gl.bindTexture(gl.TEXTURE_2D, null);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error("Stage reflection: target is incomplete");
          width = w;
          height = h;
          hdr = requestHdr;
        } catch (error) {
          release();
          throw error;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return texture;
    },
    dispose: release,
  };
}
