'use strict';

// Internal image attachment contract, validation, and metadata extraction.
// Runs in the main process: untrusted renderer data is strictly validated here.
// Rejects spoofed MIME types, oversized buffers, invalid dimensions, and malformed data.

const { ChatError } = require('./chat-error');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_IMAGE_BYTES = 12; // Minimum bytes to verify magic signature
const MAX_ATTACHMENTS = 3;
const MAX_DIMENSION = 8192; // Max width or height in pixels
const ALLOWED_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

// Magic signatures:
// PNG: 89 50 4E 47 0D 0A 1A 0A
// JPEG: FF D8 FF
// WebP: RIFF .... WEBP
function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_IMAGE_BYTES) return null;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP (RIFF + WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

// Pure JavaScript dimension extraction without external dependencies.
function parseImageDimensions(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return null;

  try {
    if (mimeType === 'image/png') {
      if (buffer.length < 24) return null;
      // Bytes 12-15 must be IHDR
      if (
        buffer[12] === 0x49 &&
        buffer[13] === 0x48 &&
        buffer[14] === 0x44 &&
        buffer[15] === 0x52
      ) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
      return null;
    }

    if (mimeType === 'image/jpeg') {
      let offset = 2; // Skip SOI (FF D8)
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        while (buffer[offset] === 0xff && offset < buffer.length) {
          offset++;
        }
        if (offset >= buffer.length) break;
        const marker = buffer[offset];
        offset++;

        // Standalone markers without length
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          continue;
        }
        if (marker === 0xda) break; // Start of Scan: SOF must precede SOS

        if (offset + 2 > buffer.length) break;
        const length = buffer.readUInt16BE(offset);

        // Start Of Frame markers:
        // C0, C1, C2, C3, C5, C6, C7, C9, CA, CB, CD, CE, CF (excluding C4 DHT, C8 JPG, CC DAC)
        const isSOF =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);

        if (isSOF) {
          if (offset + length > buffer.length || length < 7) break;
          const height = buffer.readUInt16BE(offset + 3);
          const width = buffer.readUInt16BE(offset + 5);
          return { width, height };
        }
        offset += length;
      }
      return null;
    }

    if (mimeType === 'image/webp') {
      if (buffer.length < 30) return null;
      const typeChunk = buffer.toString('ascii', 12, 16);

      // Lossy VP8
      if (typeChunk === 'VP8 ') {
        if (buffer.length < 30) return null;
        // Verify VP8 keyframe sync code (9D 01 2A) at offset 23
        if (buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
          const width = buffer.readUInt16LE(26) & 0x3fff;
          const height = buffer.readUInt16LE(28) & 0x3fff;
          return { width, height };
        }
      }

      // Lossless VP8L
      if (typeChunk === 'VP8L') {
        if (buffer.length < 25) return null;
        if (buffer[20] === 0x2f) {
          const bits = buffer.readUInt32LE(21);
          const width = (bits & 0x3fff) + 1;
          const height = ((bits >> 14) & 0x3fff) + 1;
          return { width, height };
        }
      }

      // Extended VP8X
      if (typeChunk === 'VP8X') {
        if (buffer.length < 30) return null;
        const width = buffer.readUIntLE(24, 3) + 1;
        const height = buffer.readUIntLE(27, 3) + 1;
        return { width, height };
      }

      return null;
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeFileName(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const base = raw.replace(/^.*[/\\]/, '').trim();
  // Keep alphanumeric, dash, underscore, dot; clamp to 64 chars
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  return sanitized;
}

// Converts base64 string, Buffer, or Uint8Array to Node.js Buffer
function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') {
    // Strip data URL prefix if present (e.g. "data:image/png;base64,")
    const clean = data.replace(/^data:[^;]+;base64,/, '').trim();
    if (!clean) return Buffer.alloc(0);
    return Buffer.from(clean, 'base64');
  }
  return null;
}

function normalizeAttachment(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new ChatError('invalid-attachment', 'Data lampiran tidak valid.');
  }

  const type = raw.type || 'image';
  if (type !== 'image') {
    throw new ChatError('invalid-attachment-type', 'Hanya lampiran gambar yang didukung.');
  }

  const buffer = toBuffer(raw.data);
  if (!buffer || buffer.length === 0) {
    throw new ChatError('attachment-empty', 'Berkas gambar kosong atau tidak terbaca.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ChatError('attachment-too-large', 'Ukuran gambar melebihi batas 5 MB.');
  }

  const detectedMime = detectImageFormat(buffer);
  if (!detectedMime) {
    throw new ChatError('invalid-image-format', 'Format gambar tidak didukung atau berkas rusak.');
  }

  // Check declared MIME vs actual magic signature
  if (raw.mimeType && typeof raw.mimeType === 'string') {
    const declared = raw.mimeType.toLowerCase().trim();
    if (declared !== detectedMime) {
      throw new ChatError('spoofed-image', 'Format gambar tidak sesuai dengan tipe berkas (' + declared + ' vs ' + detectedMime + ').');
    }
  }

  if (!ALLOWED_MIME_TYPES.includes(detectedMime)) {
    throw new ChatError('invalid-image-format', 'Format gambar tidak didukung (hanya PNG, JPEG, dan WebP).');
  }

  const dimensions = parseImageDimensions(buffer, detectedMime);
  if (dimensions) {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      throw new ChatError('invalid-dimensions', 'Dimensi gambar tidak valid.');
    }
    if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
      throw new ChatError(
        'oversized-dimensions',
        'Dimensi gambar melebihi batas maksimum ' + MAX_DIMENSION + 'x' + MAX_DIMENSION + ' piksel.',
      );
    }
  }

  const ext = detectedMime === 'image/jpeg' ? 'jpg' : detectedMime.slice(6);
  const name = sanitizeFileName(raw.name) || 'image.' + ext;

  return {
    type: 'image',
    mimeType: detectedMime,
    data: buffer.toString('base64'),
    size: buffer.length,
    width: dimensions ? dimensions.width : null,
    height: dimensions ? dimensions.height : null,
    name: name,
  };
}

function validateAttachments(rawList) {
  if (rawList === null || rawList === undefined) return [];
  if (!Array.isArray(rawList)) {
    throw new ChatError('invalid-attachment-list', 'Daftar lampiran harus berupa array.');
  }
  if (rawList.length > MAX_ATTACHMENTS) {
    throw new ChatError('attachment-count', 'Maksimal ' + MAX_ATTACHMENTS + ' gambar per pesan.');
  }

  return rawList.map((item) => normalizeAttachment(item));
}

module.exports = {
  detectImageFormat,
  parseImageDimensions,
  normalizeAttachment,
  validateAttachments,
  sanitizeFileName,
  MAX_IMAGE_BYTES,
  MAX_ATTACHMENTS,
  MAX_DIMENSION,
  ALLOWED_MIME_TYPES,
};
