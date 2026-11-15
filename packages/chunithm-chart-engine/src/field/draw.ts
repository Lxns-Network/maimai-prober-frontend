import { compilePrograms } from "../assets/shaderCompile";
import {
  assertDeviceUniforms,
  compileDeviceState,
  DEVICE_UNIFORMS,
  type DeviceState,
  type DeviceStateSet,
} from "../gpu/deviceState";
import {
  applyPackedTextures,
  applyPackedUniforms,
  createUniformScratch,
  resolveUniforms,
  type UniformLocations,
  type UniformScratch,
} from "../gpu/uniforms";
import { affineToWebGL, matrixToWebGL } from "./matrices";
import type { FieldMesh, FieldPackData, FieldSampler, FieldStaticMesh } from "./fieldPack";
import { fieldFrameDepths, modelDepth, primitiveDepth, type FieldFrame } from "./order";
import { wallAttributes, wallZ } from "./wall";

export interface FieldGlContext {
  readonly gl: WebGL2RenderingContext;
  readonly deviceState: DeviceState;
  /** Textures by pack id, as the pack loader uploads them. */
  readonly textures: ReadonlyMap<string, { readonly texture: WebGLTexture }>;
}

/** One field draw for a frame, shaped like the scene's external draws (pass, key, depth, draw). */
export interface FieldDraw {
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  draw(): { draws: number };
}

export interface FieldResources {
  /** The field's draws for one frame; depths follow that frame's camera. */
  draws(frame: FieldFrame): FieldDraw[];
  dispose(): void;
}

interface UploadedMesh {
  readonly vao: WebGLVertexArrayObject;
  readonly indexCount: number;
  readonly indexType: number;
  readonly buffers: ReadonlyMap<string, WebGLBuffer>;
}

interface StaticDraw {
  readonly mesh: FieldStaticMesh;
  readonly program: WebGLProgram;
  readonly locations: UniformLocations;
  readonly state: DeviceStateSet;
  readonly uploaded: UploadedMesh;
  readonly textures: Map<number, WebGLTexture>;
  readonly units: readonly number[];
  readonly samplers: readonly WebGLSampler[];
  readonly world: Float32Array;
  readonly key: number;
}

const WRAP_MODES = (gl: WebGL2RenderingContext) => [
  gl.REPEAT,
  gl.MIRRORED_REPEAT,
  gl.CLAMP_TO_EDGE,
];

/**
 * The sampler the reference device creates for a recorded state. Anisotropic filtering (minFilter 3)
 * needs the extension and a level at or below the device maximum; any other filter takes exactly one.
 */
function fieldSampler(
  gl: WebGL2RenderingContext,
  state: FieldSampler,
  owner: string,
  anisotropy: EXT_texture_filter_anisotropic | null,
): WebGLSampler {
  if (
    !WRAP_MODES(gl)[state.addressU - 1] ||
    !WRAP_MODES(gl)[state.addressV - 1] ||
    ![1, 2, 3].includes(state.minFilter) ||
    ![1, 2].includes(state.magFilter) ||
    ![0, 1, 2].includes(state.mipFilter) ||
    state.maxMipLevel !== 0
  )
    throw new RangeError(`${owner} records a sampler the field cannot draw with`);
  if (state.minFilter === 3) {
    if (!anisotropy) throw new Error(`${owner} samples anisotropically without the extension`);
    if (state.maxAnisotropy > gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
      throw new RangeError(`${owner} exceeds the device anisotropy limit`);
  } else if (state.maxAnisotropy !== 1) {
    throw new RangeError(`${owner} records anisotropy without anisotropic filtering`);
  }
  const sampler = gl.createSampler();
  if (!sampler) throw new Error("A sampler object is required for field drawing");
  const minFilter = state.minFilter === 3 ? 2 : state.minFilter;
  const min =
    state.mipFilter === 0
      ? [gl.NEAREST, gl.LINEAR][minFilter - 1]
      : [
          [gl.NEAREST_MIPMAP_NEAREST, gl.NEAREST_MIPMAP_LINEAR],
          [gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR_MIPMAP_LINEAR],
        ][minFilter - 1][state.mipFilter - 1];
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, WRAP_MODES(gl)[state.addressU - 1]);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, WRAP_MODES(gl)[state.addressV - 1]);
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, min);
  gl.samplerParameteri(
    sampler,
    gl.TEXTURE_MAG_FILTER,
    state.magFilter === 1 ? gl.NEAREST : gl.LINEAR,
  );
  if (anisotropy && state.minFilter === 3)
    gl.samplerParameterf(sampler, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, state.maxAnisotropy);
  return sampler;
}

const DEVICE_LOCATIONS = ["uViewProjection", "uWorld", "uScalar", "uTexture0"];

export async function createFieldResources(
  context: FieldGlContext,
  data: FieldPackData,
): Promise<FieldResources> {
  const { gl, deviceState } = context;
  const sources: { name: string; vertex: string; fragment: string }[] = [];
  const names = new Set<string>();
  const need = (name: string) => {
    const shader = data.shaders.get(name);
    if (!shader) throw new RangeError(`Field shader ${name} is not in the pack`);
    if (!names.has(name)) {
      names.add(name);
      sources.push({ name, vertex: shader.vertex, fragment: shader.fragment });
    }
  };
  need("wall");
  need("track");
  need(data.mask.meta.program);
  for (const model of data.statics) for (const mesh of model.meshes) need(mesh.program);
  for (const divider of data.dividers.models) need(divider.mesh.program);
  const programs = await compilePrograms(gl, sources);
  const program = (name: string): WebGLProgram => {
    const found = programs.get(name);
    if (!found) throw new RangeError(`Field program ${name} did not compile`);
    return found;
  };
  const uploaded: WebGLVertexArrayObject[] = [];
  const buffers: WebGLBuffer[] = [];
  const textureOf = (id: string): WebGLTexture => {
    const entry = context.textures.get(id);
    if (!entry) throw new RangeError(`Field texture ${id} is not uploaded`);
    return entry.texture;
  };
  const samplerCache = new Map<string, WebGLSampler>();
  const anisotropy = gl.getExtension(
    "EXT_texture_filter_anisotropic",
  ) as EXT_texture_filter_anisotropic | null;
  const sampler = (state: FieldSampler, owner: string): WebGLSampler => {
    const key = JSON.stringify(state);
    const known = samplerCache.get(key);
    if (known) return known;
    const created = fieldSampler(gl, state, owner, anisotropy);
    samplerCache.set(key, created);
    return created;
  };
  const scratch: UniformScratch = createUniformScratch();

  const upload = (
    shaderProgram: WebGLProgram,
    mesh: FieldMesh,
    dynamic: readonly string[] = [],
  ): UploadedMesh => {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("A vertex array object is required for field drawing");
    uploaded.push(vao);
    gl.bindVertexArray(vao);
    const named = new Map<string, WebGLBuffer>();
    for (const [name, { size, values }] of mesh.attributes) {
      const location = gl.getAttribLocation(shaderProgram, name);
      if (location < 0) continue;
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("A buffer is required for field drawing");
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        values,
        dynamic.includes(name) ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      named.set(name, buffer);
    }
    const indexBuffer = gl.createBuffer();
    if (!indexBuffer) throw new Error("A buffer is required for field drawing");
    buffers.push(indexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {
      vao,
      indexCount: mesh.indices.length,
      indexType: mesh.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
      buffers: named,
    };
  };

  const dispose = () => {
    for (const vao of uploaded) gl.deleteVertexArray(vao);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const shaderProgram of programs.values()) gl.deleteProgram(shaderProgram);
    for (const created of samplerCache.values()) gl.deleteSampler(created);
    samplerCache.clear();
    uploaded.length = 0;
    buffers.length = 0;
    programs.clear();
  };
  try {
    const wall = data.wall;
    const wallProgram = program("wall");
    const wallSet = compileDeviceState(wall.meta.commands, "field wall");
    const wallLocations = resolveUniforms(
      gl,
      wallProgram,
      {},
      DEVICE_LOCATIONS.concat(DEVICE_UNIFORMS),
    );
    assertDeviceUniforms(wallSet, wallLocations, "field wall");
    const wallAttr = wallAttributes(wall, wall.meta.initialRawId);
    const wallUpload = upload(
      wallProgram,
      {
        vertexCount: wall.count,
        attributes: new Map([
          ["aPosition", { size: 3, values: wallAttr.aPosition }],
          ["aColor", { size: 4, values: wallAttr.aColor }],
          ["aUv0", { size: 2, values: wallAttr.aUv0 }],
        ]),
        indices: Uint16Array.from(wall.meta.indices),
      },
      ["aPosition"],
    );
    const wallPositionBuffer = wallUpload.buffers.get("aPosition")!;
    const wallSampler = sampler(wall.meta.sampler, "field wall");
    const wallTexture = textureOf(wall.meta.textureId);
    let wallRawId = wall.meta.initialRawId;
    const setWallRawId = (rawId: number) => {
      if (rawId === wallRawId) return;
      const z = wallZ(wall, rawId);
      for (let v = 0; v < wall.count; v++) wallAttr.aPosition[v * 3 + 2] = z;
      gl.bindBuffer(gl.ARRAY_BUFFER, wallPositionBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, wallAttr.aPosition);
      wallRawId = rawId;
    };

    const trackProgram = program("track");
    const trackSet = compileDeviceState(data.track.meta.commands, "field track surface");
    const trackLocations = resolveUniforms(
      gl,
      trackProgram,
      {},
      DEVICE_LOCATIONS.concat(DEVICE_UNIFORMS),
    );
    assertDeviceUniforms(trackSet, trackLocations, "field track surface");
    const trackUpload = upload(trackProgram, data.track.mesh);
    const trackWorld = matrixToWebGL(Float32Array.from(data.track.meta.world4x4));

    const maskMeta = data.mask.meta;
    if (!maskMeta.supportedFieldStates.includes(maskMeta.fieldState))
      throw new RangeError("The field mask state is not one the pack supports");
    const maskProgram = program(maskMeta.program);
    const maskSet = compileDeviceState(maskMeta.commands, "field mask");
    const maskLocations = resolveUniforms(
      gl,
      maskProgram,
      {},
      DEVICE_LOCATIONS.concat(DEVICE_UNIFORMS),
    );
    assertDeviceUniforms(maskSet, maskLocations, "field mask");
    const maskUpload = upload(maskProgram, data.mask.mesh);
    const maskWorld = matrixToWebGL(Float32Array.from(maskMeta.worldMatrix4x4));

    const prepareStatic = (mesh: FieldStaticMesh, key: number, owner: string): StaticDraw => {
      const meshProgram = program(mesh.program);
      const state = compileDeviceState(mesh.commands, `field model ${owner}`);
      const locations = resolveUniforms(
        gl,
        meshProgram,
        mesh.uniforms,
        DEVICE_LOCATIONS.concat(DEVICE_UNIFORMS),
      );
      assertDeviceUniforms(state, locations, `field model ${owner}`);
      const textures = new Map<number, WebGLTexture>();
      for (const slot of mesh.textures) textures.set(slot.unit, textureOf(slot.id));
      return {
        mesh,
        program: meshProgram,
        locations,
        state,
        uploaded: upload(meshProgram, mesh.mesh),
        textures,
        units: mesh.textures.map((slot) => slot.unit),
        samplers: mesh.textures.map((slot) => sampler(slot.sampler, owner)),
        world: affineToWebGL(mesh.world3x4),
        key,
      };
    };
    const statics = data.statics.flatMap((model) =>
      model.meshes.map((mesh) => prepareStatic(mesh, model.key, model.modelUrl)),
    );
    const dividers = data.dividers.models.map((model) => {
      const draw = prepareStatic(model.mesh, model.key, "divider");
      return { draw, colors: model.byColor.map(textureOf), items: [...statics, draw] };
    });

    const drawIndexed = (mesh: UploadedMesh) => {
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
      gl.bindVertexArray(null);
    };

    const withState = (
      shaderProgram: WebGLProgram,
      set: DeviceStateSet,
      locations: UniformLocations,
    ) => {
      gl.useProgram(shaderProgram);
      deviceState.apply(set, shaderProgram, locations);
    };

    return {
      draws(frame: FieldFrame): FieldDraw[] {
        const depths = fieldFrameDepths(frame);
        const viewProjection = matrixToWebGL(Float32Array.from(frame.viewProjection));
        const out: FieldDraw[] = [];
        const wallDepth = primitiveDepth(
          depths,
          wall.meta.sortPosition,
          wall.meta.sortDistanceOffset,
        );
        wallZ(wall, frame.wallRawId);
        out.push({
          pass: wall.meta.passIndex,
          key: wall.meta.key,
          depth: wallDepth,
          draw() {
            setWallRawId(frame.wallRawId);
            withState(wallProgram, wallSet, wallLocations);
            gl.uniformMatrix4fv(
              wallLocations.get("uViewProjection") ?? null,
              false,
              viewProjection,
            );
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, wallTexture);
            gl.bindSampler(0, wallSampler);
            gl.uniform1i(wallLocations.get("uTexture0") ?? null, 0);
            drawIndexed(wallUpload);
            return { draws: 1 };
          },
        });
        out.push({
          pass: data.track.meta.passIndex,
          key: data.track.meta.key,
          depth: primitiveDepth(
            depths,
            data.track.meta.sortPosition,
            data.track.meta.sortDistanceOffset,
          ),
          draw() {
            withState(trackProgram, trackSet, trackLocations);
            gl.uniformMatrix4fv(trackLocations.get("uWorld") ?? null, false, trackWorld);
            gl.uniformMatrix4fv(
              trackLocations.get("uViewProjection") ?? null,
              false,
              viewProjection,
            );
            drawIndexed(trackUpload);
            return { draws: 1 };
          },
        });
        if (frame.maskShown)
          out.push({
            pass: maskMeta.passIndex,
            key: maskMeta.key,
            depth: primitiveDepth(depths, maskMeta.sortPosition, maskMeta.sortDistanceOffset),
            draw() {
              withState(maskProgram, maskSet, maskLocations);
              gl.uniformMatrix4fv(maskLocations.get("uWorld") ?? null, false, maskWorld);
              gl.uniformMatrix4fv(
                maskLocations.get("uViewProjection") ?? null,
                false,
                viewProjection,
              );
              gl.uniform1f(maskLocations.get("uScalar") ?? null, maskMeta.scalar);
              drawIndexed(maskUpload);
              return { draws: 1 };
            },
          });
        if (
          !Number.isInteger(frame.dividerRow) ||
          frame.dividerRow < 0 ||
          frame.dividerRow > dividers.length
        )
          throw new RangeError("Invalid field divider option");
        const divider = frame.dividerRow ? dividers[frame.dividerRow - 1] : null;
        if (divider) {
          if (!Number.isSafeInteger(frame.dividerColor))
            throw new RangeError("Invalid field divider color");
          const color =
            frame.dividerColor >= 0 && frame.dividerColor < data.dividers.colors
              ? frame.dividerColor
              : data.dividers.defaultColor;
          const texture = divider.colors[color];
          divider.draw.textures.set(0, texture);
        }
        for (const item of divider ? divider.items : statics)
          out.push({
            pass: item.mesh.passIndex,
            key: item.key,
            depth: modelDepth(depths, item.mesh.world3x4, item.mesh.sortDistanceOffset),
            draw() {
              withState(item.program, item.state, item.locations);
              gl.uniformMatrix4fv(item.locations.get("uWorld") ?? null, false, item.world);
              gl.uniformMatrix4fv(
                item.locations.get("uViewProjection") ?? null,
                false,
                viewProjection,
              );
              applyPackedUniforms(gl, item.locations, item.mesh.uniforms, scratch);
              applyPackedTextures(
                gl,
                item.program,
                item.units,
                item.textures,
                [],
                undefined,
                item.samplers,
              );
              drawIndexed(item.uploaded);
              return { draws: 1 };
            },
          });
        return out;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
