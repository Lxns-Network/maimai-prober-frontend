export interface ProgramSource {
  name: string;
  vertex: string;
  fragment: string;
}

/** The caller owns the linked program; failed attempts release every allocated object. */
export function compileProgram(gl: WebGL2RenderingContext, source: ProgramSource): WebGLProgram {
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  try {
    program = gl.createProgram();
    if (!program) throw new Error(`Unable to create program: ${source.name}`);
    for (const [type, text] of [
      [gl.VERTEX_SHADER, source.vertex],
      [gl.FRAGMENT_SHADER, source.fragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error(`Unable to create shader: ${source.name}`);
      shaders.push(shader);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(
          `${source.name}: ${gl.getShaderInfoLog(shader) || "shader compilation failed"}`,
        );
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`${source.name}: ${gl.getProgramInfoLog(program) || "program link failed"}`);
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

export async function compilePrograms(
  gl: WebGL2RenderingContext,
  sources: ProgramSource[],
  schedule: (cb: () => void) => void = (cb) => requestAnimationFrame(() => cb()),
): Promise<Map<string, WebGLProgram>> {
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as {
    COMPLETION_STATUS_KHR: number;
  } | null;
  const shaders: WebGLShader[] = [];
  const programs = new Map<string, WebGLProgram>();
  try {
    const pending = sources.map((source) => {
      const compile = (type: number, text: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Unable to create shader: " + source.name);
        shaders.push(shader);
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, source.vertex);
      const fs = compile(gl.FRAGMENT_SHADER, source.fragment);
      const program = gl.createProgram();
      if (!program) throw new Error("Unable to create program: " + source.name);
      programs.set(source.name, program);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      return { name: source.name, program, vs, fs };
    });
    if (parallel)
      await new Promise<void>((resolve, reject) => {
        const poll = () => {
          try {
            if (gl.isContextLost()) throw new Error("WebGL context lost during shader compilation");
            if (
              pending.every((p) =>
                gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR),
              )
            )
              resolve();
            else schedule(poll);
          } catch (error) {
            reject(error);
          }
        };
        poll();
      });
    for (const p of pending) {
      if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
        const log = [
          gl.getProgramInfoLog(p.program),
          gl.getShaderInfoLog(p.vs),
          gl.getShaderInfoLog(p.fs),
        ]
          .filter(Boolean)
          .join("\n");
        throw new Error("Program " + p.name + " failed to link: " + log);
      }
    }
    return programs;
  } catch (error) {
    for (const program of programs.values()) gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}
