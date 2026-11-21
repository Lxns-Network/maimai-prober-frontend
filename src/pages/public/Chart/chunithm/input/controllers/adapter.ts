import type { SurfaceSample } from "@lxns-network/chunithm-chart-engine/chart/play/input";

/** 31 RGB lights left to right, or null to turn them off. The caller may reuse the frame immediately. */
export type ControllerLightWriter = (rgb: Uint8Array | null) => void;

export type ControllerInput = (sample: SurfaceSample, receivedAt: number) => void;

export interface ControllerDevice {
  name: string;
  listen(signal: AbortSignal, onInput: ControllerInput, onError: (error: unknown) => void): void;
  sendLights(rgb: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}

export interface WebUsbControllerAdapter {
  name: string;
  filter: { vendorId: number; productId: number };
  configuration: number;
  interfaceNumber: number;
  inputEndpoint: number;
  outputEndpoint: number;
  transferLength: number;
  /** Encodes a slider frame, or switches all lights off when the connection closes. */
  encodeLights(rgb: Uint8Array | null, report?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  /** Decoder state belongs to one connection. */
  createDecoder(): (report: DataView) => SurfaceSample;
}
