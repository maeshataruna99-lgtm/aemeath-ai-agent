'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectImageFormat,
  parseImageDimensions,
  normalizeAttachment,
  validateAttachments,
  sanitizeFileName,
  MAX_IMAGE_BYTES,
  MAX_ATTACHMENTS,
  MAX_DIMENSION,
} = require('../src/chat/attachment');
const { ChatError } = require('../src/chat/chat-error');

// Minimal 10x20 PNG buffer
function createTestPng(width = 10, height = 20) {
  const buf = Buffer.alloc(33);
  // PNG Signature
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk: length 13
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 2; // color type (truecolor)
  buf[26] = 0; // compression
  buf[27] = 0; // filter
  buf[28] = 0; // interlace
  buf.writeUInt32BE(0x12345678, 29); // dummy CRC
  return buf;
}

// Minimal 32x16 JPEG buffer
function createTestJpeg(width = 32, height = 16) {
  const buf = Buffer.alloc(30);
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xc0; // SOF0
  buf.writeUInt16BE(11, 4); // length: 11
  buf[6] = 8; // precision
  buf.writeUInt16BE(height, 7); // height
  buf.writeUInt16BE(width, 9); // width
  buf[11] = 3; // 3 components
  // padding and EOI
  buf[28] = 0xff;
  buf[29] = 0xd9;
  return buf;
}

// Minimal 64x48 Lossy WebP buffer
function createTestWebp(width = 64, height = 48) {
  const buf = Buffer.alloc(36);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(28, 4); // file size - 8
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // chunk length
  // Frame tag
  buf[20] = 0x00;
  buf[21] = 0x00;
  buf[22] = 0x00;
  // Keyframe start code: 9D 01 2A
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  // 14-bit width and 14-bit height
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

async function catchCode(fn) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ChatError) return err.code;
    throw err;
  }
  return null;
}

test('detectImageFormat identifies PNG, JPEG, and WebP signatures accurately', () => {
  assert.equal(detectImageFormat(createTestPng()), 'image/png');
  assert.equal(detectImageFormat(createTestJpeg()), 'image/jpeg');
  assert.equal(detectImageFormat(createTestWebp()), 'image/webp');
  assert.equal(detectImageFormat(Buffer.from('not an image')), null);
  assert.equal(detectImageFormat(Buffer.from([0x47, 0x49, 0x46, 0x38])), null); // GIF
  assert.equal(detectImageFormat(null), null);
});

test('parseImageDimensions extracts width and height accurately', () => {
  assert.deepEqual(parseImageDimensions(createTestPng(120, 80), 'image/png'), { width: 120, height: 80 });
  assert.deepEqual(parseImageDimensions(createTestJpeg(320, 240), 'image/jpeg'), { width: 320, height: 240 });
  assert.deepEqual(parseImageDimensions(createTestWebp(640, 480), 'image/webp'), { width: 640, height: 480 });
  assert.equal(parseImageDimensions(Buffer.from('invalid'), 'image/png'), null);
});

test('sanitizeFileName removes path traversal and clamps length', () => {
  assert.equal(sanitizeFileName('../../etc/passwd.png'), 'passwd.png');
  assert.equal(sanitizeFileName('C:\\Windows\\System32\\calc.jpeg'), 'calc.jpeg');
  assert.equal(sanitizeFileName('normal-image_01.webp'), 'normal-image_01.webp');
  assert.equal(sanitizeFileName('a'.repeat(100) + '.png').length, 64);
  assert.equal(sanitizeFileName(''), '');
  assert.equal(sanitizeFileName(null), '');
});

test('normalizeAttachment validates valid PNG attachment', () => {
  const pngBuf = createTestPng(100, 200);
  const result = normalizeAttachment({
    type: 'image',
    mimeType: 'image/png',
    data: pngBuf.toString('base64'),
    name: 'test.png',
  });

  assert.equal(result.type, 'image');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.size, pngBuf.length);
  assert.equal(result.width, 100);
  assert.equal(result.height, 200);
  assert.equal(result.name, 'test.png');
  assert.equal(result.data, pngBuf.toString('base64'));
});

test('normalizeAttachment strips data URL prefix correctly', () => {
  const pngBuf = createTestPng(10, 20);
  const dataUrl = 'data:image/png;base64,' + pngBuf.toString('base64');
  const result = normalizeAttachment({
    type: 'image',
    data: dataUrl,
  });

  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.data, pngBuf.toString('base64'));
  assert.equal(result.width, 10);
  assert.equal(result.height, 20);
});

test('normalizeAttachment accepts Buffer and Uint8Array directly', () => {
  const jpegBuf = createTestJpeg(50, 60);
  const result = normalizeAttachment({
    type: 'image',
    data: jpegBuf,
  });

  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.size, jpegBuf.length);
  assert.equal(result.width, 50);
  assert.equal(result.height, 60);
});

test('normalizeAttachment rejects spoofed MIME types', () => {
  const jpegBuf = createTestJpeg(50, 60);
  // Declaring PNG when content is actually JPEG
  assert.throws(
    () =>
      normalizeAttachment({
        type: 'image',
        mimeType: 'image/png',
        data: jpegBuf.toString('base64'),
      }),
    (err) => err instanceof ChatError && err.code === 'spoofed-image',
  );
});

test('normalizeAttachment rejects unsupported image formats (e.g. GIF or random bytes)', () => {
  const gifBuf = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
  assert.throws(
    () =>
      normalizeAttachment({
        type: 'image',
        data: gifBuf.toString('base64'),
      }),
    (err) => err instanceof ChatError && err.code === 'invalid-image-format',
  );
});

test('normalizeAttachment rejects empty, non-object, and non-image types', () => {
  assert.throws(() => normalizeAttachment(null), (err) => err.code === 'invalid-attachment');
  assert.throws(() => normalizeAttachment({ type: 'audio' }), (err) => err.code === 'invalid-attachment-type');
  assert.throws(() => normalizeAttachment({ type: 'image', data: '' }), (err) => err.code === 'attachment-empty');
});

test('normalizeAttachment rejects oversized buffers (> 5MB)', () => {
  // Create a buffer exceeding 5MB
  const bigBuf = Buffer.alloc(MAX_IMAGE_BYTES + 10);
  // Give it PNG magic bytes so it reaches the size check
  bigBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

  assert.throws(
    () =>
      normalizeAttachment({
        type: 'image',
        data: bigBuf,
      }),
    (err) => err instanceof ChatError && err.code === 'attachment-too-large',
  );
});

test('normalizeAttachment rejects oversized dimensions (> 8192px)', () => {
  const hugePng = createTestPng(MAX_DIMENSION + 1, 100);
  assert.throws(
    () =>
      normalizeAttachment({
        type: 'image',
        data: hugePng,
      }),
    (err) => err instanceof ChatError && err.code === 'oversized-dimensions',
  );
});

test('validateAttachments handles empty lists, valid lists, and rejects count > MAX_ATTACHMENTS', () => {
  assert.deepEqual(validateAttachments(null), []);
  assert.deepEqual(validateAttachments([]), []);

  assert.throws(
    () => validateAttachments('not-an-array'),
    (err) => err instanceof ChatError && err.code === 'invalid-attachment-list',
  );

  const png = { type: 'image', data: createTestPng(10, 10) };
  const valid = validateAttachments([png, png]);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].mimeType, 'image/png');

  // Exceed max attachments
  const tooMany = [png, png, png, png]; // 4 > 3
  assert.throws(
    () => validateAttachments(tooMany),
    (err) => err instanceof ChatError && err.code === 'attachment-count',
  );
});
