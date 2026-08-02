import { extname } from "node:path";
import { ArchiveError, type ImageInspection, type SupportedMediaType } from "@text-to-image/domain";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function inspectImage(bytes: Uint8Array, sourcePath?: string): ImageInspection {
  const buffer = Buffer.from(bytes);
  let inspection: ImageInspection | null = null;
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    inspection = inspectPng(buffer);
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    inspection = inspectJpeg(buffer);
  } else if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    inspection = inspectWebp(buffer);
  }

  if (!inspection) {
    const prefix = buffer.toString("utf8", 0, Math.min(buffer.length, 512));
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix)) {
      throw new ArchiveError("IMAGE_UNSUPPORTED", "SVG images are not supported.");
    }
    throw new ArchiveError("IMAGE_INVALID", "Image payload is corrupt or unsupported.");
  }

  if (sourcePath) {
    assertMatchingExtension(sourcePath, inspection.mediaType);
  }
  return inspection;
}

function inspectPng(buffer: Buffer): ImageInspection {
  if (
    buffer.length < 33 ||
    buffer.toString("ascii", 12, 16) !== "IHDR" ||
    buffer.includes(Buffer.from("acTL", "ascii"))
  ) {
    throw new ArchiveError(
      buffer.includes(Buffer.from("acTL", "ascii")) ? "IMAGE_UNSUPPORTED" : "IMAGE_INVALID",
      buffer.includes(Buffer.from("acTL", "ascii"))
        ? "Animated PNG images are not supported."
        : "PNG payload does not contain a valid IHDR chunk.",
    );
  }
  return dimensions("image/png", "png", buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function inspectJpeg(buffer: Buffer): ImageInspection {
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      continue;
    }
    if (offset + 2 > buffer.length) {
      break;
    }
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) {
      break;
    }
    const isStartOfFrame =
      marker !== undefined &&
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      );
    if (isStartOfFrame && length >= 7) {
      return dimensions(
        "image/jpeg",
        "jpg",
        buffer.readUInt16BE(offset + 5),
        buffer.readUInt16BE(offset + 3),
      );
    }
    offset += length;
  }
  throw new ArchiveError("IMAGE_INVALID", "JPEG payload has no valid frame header.");
}

function inspectWebp(buffer: Buffer): ImageInspection {
  if (
    buffer.includes(Buffer.from("ANIM", "ascii")) ||
    buffer.includes(Buffer.from("ANMF", "ascii"))
  ) {
    throw new ArchiveError("IMAGE_UNSUPPORTED", "Animated WebP images are not supported.");
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkLength > buffer.length) {
      throw new ArchiveError("IMAGE_INVALID", "WebP chunk exceeds payload length.");
    }
    if (chunkType === "VP8X" && chunkLength >= 10) {
      const flags = buffer[dataOffset];
      if (flags !== undefined && (flags & 0x02) !== 0) {
        throw new ArchiveError("IMAGE_UNSUPPORTED", "Animated WebP images are not supported.");
      }
      return dimensions(
        "image/webp",
        "webp",
        readUInt24LE(buffer, dataOffset + 4) + 1,
        readUInt24LE(buffer, dataOffset + 7) + 1,
      );
    }
    if (chunkType === "VP8L" && chunkLength >= 5 && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return dimensions("image/webp", "webp", (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a
    ) {
      return dimensions(
        "image/webp",
        "webp",
        buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      );
    }
    offset = dataOffset + chunkLength + (chunkLength % 2);
  }
  throw new ArchiveError("IMAGE_INVALID", "WebP payload has no supported image frame.");
}

function dimensions(
  mediaType: SupportedMediaType,
  extension: ImageInspection["extension"],
  width: number,
  height: number,
): ImageInspection {
  if (width < 1 || height < 1) {
    throw new ArchiveError("IMAGE_INVALID", "Image dimensions must be positive.");
  }
  return { mediaType, extension, width, height };
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  if (offset + 3 > buffer.length) {
    throw new ArchiveError("IMAGE_INVALID", "Image dimension field is truncated.");
  }
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);
}

function assertMatchingExtension(path: string, mediaType: SupportedMediaType): void {
  const extension = extname(path).toLowerCase();
  if (!extension) {
    return;
  }
  const known: Record<string, SupportedMediaType> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  if (known[extension] && known[extension] !== mediaType) {
    throw new ArchiveError("IMAGE_INVALID", "Image extension does not match payload bytes.", {
      extension,
      mediaType,
    });
  }
}
