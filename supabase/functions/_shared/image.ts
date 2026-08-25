// Image validation for anything a client uploads or sends to the model.
//
// THREAT MODEL — what an attacker controls and what stops them:
//
//  1. The declared MIME type is attacker-controlled. A client can claim
//     "image/jpeg" and send a PHP script, an HTML page, or a zip. We therefore
//     ignore the declared type entirely and sniff the real one from the file's
//     magic bytes, then use the sniffed value everywhere downstream.
//
//  2. Polyglots — files that are simultaneously a valid JPEG and valid HTML —
//     are the reason SVG is not on the allow-list at any layer. SVG is XML, can
//     carry <script>, and browsers execute it when served inline. There is no
//     safe way to accept SVG here, and no reason to.
//
//  3. Decompression bombs: a 40 KB PNG can decode to gigabytes of pixels. Size
//     alone is not a sufficient guard, so dimensions are read from the header
//     and capped before anything decodes the image.
//
//  4. Path traversal via filename ("../../other-user/x.jpg"). Client filenames
//     are never used. Storage paths are generated server-side as
//     `{user_id}/{uuid}.{ext}`, and the bucket's RLS additionally pins the
//     first path segment to auth.uid(), so even a bug here cannot cross users.
//
//  5. Oversized payloads are rejected before base64 decoding, so a huge body
//     cannot exhaust memory on the way in.

/** Hard ceiling on the decoded image, in bytes. Above a full-res iPhone JPEG. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Base64 inflates by ~4/3; reject obviously-too-big strings before decoding. */
export const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024;

/** Anthropic's vision API accepts these. HEIC is converted client-side first. */
export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Guards against decompression bombs. 8000px covers any phone camera. */
const MAX_DIMENSION = 8000;

export type ValidImage = {
  bytes: Uint8Array;
  mediaType: SniffedType;
  width: number;
  height: number;
  extension: string;
};

export type ImageError = { error: string };

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  return sig.every((v, i) => b[offset + i] === v);
}

/** Real type from magic bytes. The client's claim is never consulted. */
function sniff(b: Uint8Array): SniffedType | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  // WebP is "RIFF" + 4 size bytes + "WEBP".
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/** Dimensions straight from the header, without decoding pixel data. */
function dimensions(b: Uint8Array, type: SniffedType): { width: number; height: number } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);

  if (type === 'image/png') {
    // IHDR is always the first chunk: width/height are big-endian at 16 and 20.
    if (b.length < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (type === 'image/gif') {
    if (b.length < 10) return null;
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  if (type === 'image/webp') {
    // Simple lossy ("VP8 ") and lossless ("VP8L") layouts differ.
    if (b.length < 30) return null;
    const fourCC = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourCC === 'VP8 ') {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (fourCC === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourCC === 'VP8X') {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { width: w, height: h };
    }
    return null;
  }

  // JPEG: walk the marker segments to the start-of-frame, which carries the size.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    const segmentLength = view.getUint16(i + 2);
    if (segmentLength < 2) return null;
    i += 2 + segmentLength;
  }
  return null;
}

const EXTENSIONS: Record<SniffedType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Validates a base64 image from a client. Returns the sniffed type — callers
 * must use that, never the client's declared mediaType.
 */
export function validateBase64Image(base64: unknown): ValidImage | ImageError {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return { error: 'No image provided.' };
  }
  if (base64.length > MAX_BASE64_CHARS) {
    return { error: 'Image is too large. Maximum 8 MB.' };
  }
  // Strip an optional data: URL prefix, then reject anything that is not
  // strictly base64 — this also rejects the "data:text/html," style payloads
  // that try to smuggle markup through.
  const cleaned = base64.replace(/^data:[^;,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    return { error: 'Image is not valid base64.' };
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(cleaned);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return { error: 'Image is not valid base64.' };
  }

  if (bytes.length === 0) return { error: 'Image is empty.' };
  if (bytes.length > MAX_IMAGE_BYTES) return { error: 'Image is too large. Maximum 8 MB.' };

  const mediaType = sniff(bytes);
  if (!mediaType) {
    return { error: 'That file is not a JPEG, PNG, WebP or GIF image.' };
  }

  const dims = dimensions(bytes, mediaType);
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    return { error: 'Could not read the image dimensions — the file looks corrupt.' };
  }
  if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    return { error: `Image is too large: ${dims.width}×${dims.height}. Maximum 8000px per side.` };
  }

  return {
    bytes,
    mediaType,
    width: dims.width,
    height: dims.height,
    extension: EXTENSIONS[mediaType],
  };
}

export function isImageError(v: ValidImage | ImageError): v is ImageError {
  return 'error' in v;
}

/**
 * Storage path for a user's photo. Built entirely server-side from the user id
 * and a fresh UUID — no part of it comes from the client, so a crafted filename
 * cannot escape the user's own prefix.
 */
export function storagePathFor(userId: string, extension: string): string {
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}
