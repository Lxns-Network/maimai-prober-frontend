import {
  createFieldResources,
  type FieldPackData,
} from "@lxns-network/chunithm-chart-engine/field";
import { readCameraSample } from "@lxns-network/chunithm-chart-engine/field/cameraSample";
import { createBarlinePositions } from "@lxns-network/chunithm-chart-engine/field/barlines";
import type { NoteScore } from "@lxns-network/chunithm-chart-engine/notes/score";
import { createDeviceState } from "@lxns-network/chunithm-chart-engine/gpu/deviceState";
import type {
  FrameCamera,
  FrameCameraEvaluation,
  FrameDraw,
} from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import {
  evaluatePlayCamera,
  type PlayCameraInput,
} from "@lxns-network/chunithm-chart-engine/scene/camera";

const CAMERA_NODE = 1000;

export interface Field {
  draws(input: {
    score: NoteScore;
    seconds: number;
    speedRow: number;
    speedMultiplier: number;
    camera: FrameCamera;
    environment: FieldPackData["camera"]["environment"];
    wallRawId: number;
    maskShown: boolean;
    dividerRow: number;
    dividerColor: number;
  }): FrameDraw[];
  dispose(): void;
}

/**
 * Builds the field's draws over the note pack's uploaded textures. Each draw resets the device
 * state it applies first, because the notes and effects draw on the same context between them.
 */
export async function createField(input: {
  gl: WebGL2RenderingContext;
  data: FieldPackData;
  textures: ReadonlyMap<string, { readonly texture: WebGLTexture }>;
}): Promise<Field> {
  const deviceState = createDeviceState(input.gl);
  const positions = createBarlinePositions();
  const resources = await createFieldResources(
    { gl: input.gl, deviceState, textures: input.textures },
    input.data,
  );
  return {
    draws({
      camera,
      environment,
      wallRawId,
      maskShown,
      dividerRow,
      dividerColor,
      score,
      seconds,
      speedRow,
      speedMultiplier,
    }) {
      return resources
        .draws({
          barPositions: positions(score, seconds, speedRow, speedMultiplier),
          view: camera.cameraA,
          projection: camera.cameraB,
          viewProjection: camera.viewProjection,
          environment,
          wallRawId,
          maskShown,
          dividerRow,
          dividerColor,
        })
        .map((item) => ({
          pass: item.pass,
          key: item.key,
          depth: item.depth,
          draw() {
            deviceState.invalidate();
            return item.draw();
          },
        }));
    },
    dispose() {
      resources.dispose();
    },
  };
}

/** The play camera of the field's packed inputs, evaluated per canvas size. */
export function createFieldCamera(
  data: FieldPackData,
): (width: number, height: number) => FrameCameraEvaluation {
  const resource = readCameraSample(data.camera.sampleBytes, CAMERA_NODE);
  const input: PlayCameraInput = {
    resource,
    initial: data.camera.camera.initial,
    state: data.camera.camera.state,
    world: data.camera.camera.world,
    environment: data.camera.environment,
  };
  let key = "";
  let value: FrameCameraEvaluation | null = null;
  return (width, height) => {
    const next = `${width}:${height}`;
    if (next !== key || !value) {
      value = evaluatePlayCamera(input, width, height);
      key = next;
    }
    return value;
  };
}
