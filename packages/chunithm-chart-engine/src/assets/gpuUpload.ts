import { parseKtx2, VK_FORMAT } from "./ktx2";
import type { TextureChoice } from "./textureFormat";

/** Maps a KTX2 vkFormat to its WebGL compressed internal format; RGBA8 returns null. */
function compressedFormat(gl: WebGL2RenderingContext, vk: number): number | null {
  const s3tc = gl.getExtension("WEBGL_compressed_texture_s3tc") as Record<string, number> | null;
  const astc = gl.getExtension("WEBGL_compressed_texture_astc") as Record<string, number> | null;
  const etc = gl.getExtension("WEBGL_compressed_texture_etc") as Record<string, number> | null;
  switch (vk) {
    case VK_FORMAT.BC1_RGBA_UNORM:
      if (!s3tc) throw new Error("BC1 payload requires WEBGL_compressed_texture_s3tc");
      return s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT;
    case VK_FORMAT.BC2_UNORM:
      if (!s3tc) throw new Error("BC2 payload requires WEBGL_compressed_texture_s3tc");
      return s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT;
    case VK_FORMAT.BC3_UNORM:
      if (!s3tc) throw new Error("BC3 payload requires WEBGL_compressed_texture_s3tc");
      return s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;
    case VK_FORMAT.ASTC_4x4_UNORM:
      if (!astc) throw new Error("ASTC payload requires WEBGL_compressed_texture_astc");
      return astc.COMPRESSED_RGBA_ASTC_4x4_KHR;
    case VK_FORMAT.ETC2_R8G8B8_UNORM:
      if (!etc) throw new Error("ETC2 payload requires WEBGL_compressed_texture_etc");
      return etc.COMPRESSED_RGB8_ETC2;
    case VK_FORMAT.ETC2_R8G8B8A8_UNORM:
      if (!etc) throw new Error("ETC2 payload requires WEBGL_compressed_texture_etc");
      return etc.COMPRESSED_RGBA8_ETC2_EAC;
    case VK_FORMAT.R8G8B8A8_UNORM:
      return null;
    default:
      throw new Error(`Unsupported KTX2 vkFormat ${vk}`);
  }
}

/** Allocates immutable storage and uploads every KTX2 level as-is; keeps no reference to `bytes`. */
export function uploadKtx2(gl: WebGL2RenderingContext, bytes: Uint8Array, choice: TextureChoice) {
  const img = parseKtx2(bytes);
  const levels = choice.dropTopMip && img.levels.length > 1 ? img.levels.slice(1) : img.levels;
  const format = compressedFormat(gl, img.vkFormat);
  const faceBytes = (width: number, height: number) => {
    if (img.vkFormat === VK_FORMAT.R8G8B8A8_UNORM) return width * height * 4;
    const blockBytes =
      img.vkFormat === VK_FORMAT.BC1_RGBA_UNORM || img.vkFormat === VK_FORMAT.ETC2_R8G8B8_UNORM
        ? 8
        : 16;
    return Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes;
  };
  for (const level of levels)
    if (level.byteLength !== faceBytes(level.width, level.height) * img.faces)
      throw new RangeError("KTX2 level size does not match its faces");
  const texture = gl.createTexture();
  if (!texture) throw new Error("createTexture failed");
  try {
    const target = img.faces === 6 ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
    gl.bindTexture(target, texture);
    const top = levels[0];
    gl.texStorage2D(target, levels.length, format ?? gl.RGBA8, top.width, top.height);
    let gpuBytes = 0;
    levels.forEach((level, i) => {
      const size = faceBytes(level.width, level.height);
      for (let face = 0; face < img.faces; face++) {
        const faceTarget = img.faces === 6 ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + face : target;
        const offset = level.byteOffset + face * size;
        const data = bytes.subarray(offset, offset + size);
        if (format === null)
          gl.texSubImage2D(
            faceTarget,
            i,
            0,
            0,
            level.width,
            level.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data,
          );
        else
          gl.compressedTexSubImage2D(faceTarget, i, 0, 0, level.width, level.height, format, data);
      }
      gpuBytes += level.byteLength;
    });
    gl.texParameteri(target, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(target, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
    return {
      texture,
      target,
      width: top.width,
      height: top.height,
      levels: levels.length,
      gpuBytes,
    };
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}
