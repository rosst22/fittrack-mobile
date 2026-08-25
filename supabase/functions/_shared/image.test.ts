// Tests for the upload validator. Run: deno test supabase/functions/_shared/
//
// These are security tests, not formatting tests. Each case is an attack the
// validator is supposed to stop.
import { assertEquals, assert } from 'jsr:@std/assert@1';

import { isImageError, storagePathFor, validateBase64Image } from './image.ts';

/** base64 of the given bytes. */
function b64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Smallest valid PNG header + IHDR declaring width x height. */
function pngHeader(width: number, height: number): number[] {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdrLen = [0x00, 0x00, 0x00, 0x0d];
  const ihdr = [0x49, 0x48, 0x44, 0x52];
  const be = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return [...sig, ...ihdrLen, ...ihdr, ...be(width), ...be(height), 0x08, 0x02, 0, 0, 0];
}

/** Minimal JPEG: SOI + SOF0 segment carrying the dimensions. */
function jpegHeader(width: number, height: number): number[] {
  return [
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    ...new Array(9).fill(0),
  ];
}

Deno.test('accepts a real PNG and reports its dimensions', () => {
  const result = validateBase64Image(b64(pngHeader(640, 480)));
  assert(!isImageError(result));
  assertEquals(result.mediaType, 'image/png');
  assertEquals(result.width, 640);
  assertEquals(result.height, 480);
  assertEquals(result.extension, 'png');
});

Deno.test('accepts a real JPEG', () => {
  const result = validateBase64Image(b64(jpegHeader(1024, 768)));
  assert(!isImageError(result));
  assertEquals(result.mediaType, 'image/jpeg');
  assertEquals(result.width, 1024);
  assertEquals(result.height, 768);
});

Deno.test('strips a data: URL prefix rather than choking on it', () => {
  const result = validateBase64Image(`data:image/png;base64,${b64(pngHeader(10, 10))}`);
  assert(!isImageError(result));
  assertEquals(result.mediaType, 'image/png');
});

// --- the attacks -----------------------------------------------------------

Deno.test('rejects HTML masquerading as an image', () => {
  const html = btoa('<html><script>alert(1)</script></html>');
  const result = validateBase64Image(html);
  assert(isImageError(result));
});

Deno.test('rejects SVG outright — it is XML and can carry script', () => {
  const svg = btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const result = validateBase64Image(svg);
  assert(isImageError(result));
});

Deno.test('rejects a PHP payload with an image-like name', () => {
  const php = btoa('<?php system($_GET["c"]); ?>');
  assert(isImageError(validateBase64Image(php)));
});

Deno.test('rejects an ELF binary', () => {
  assert(isImageError(validateBase64Image(b64([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0]))));
});

Deno.test('rejects a ZIP, which is how polyglot archives arrive', () => {
  assert(isImageError(validateBase64Image(b64([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))));
});

Deno.test('rejects a decompression bomb by its declared dimensions', () => {
  // 40 KB on the wire, ~2.5 billion pixels decoded.
  const result = validateBase64Image(b64(pngHeader(50000, 50000)));
  assert(isImageError(result));
  assert(result.error.includes('8000px'));
});

Deno.test('rejects an oversized payload before decoding it', () => {
  const huge = 'A'.repeat(12 * 1024 * 1024);
  const result = validateBase64Image(huge);
  assert(isImageError(result));
  assert(result.error.includes('too large'));
});

Deno.test('rejects non-base64 input', () => {
  assert(isImageError(validateBase64Image('not base64 !!!! ***')));
});

Deno.test('rejects empty and non-string input', () => {
  assert(isImageError(validateBase64Image('')));
  assert(isImageError(validateBase64Image(null)));
  assert(isImageError(validateBase64Image(undefined)));
  assert(isImageError(validateBase64Image(42)));
  assert(isImageError(validateBase64Image({ image: 'x' })));
});

Deno.test('rejects a truncated header that sniffs but has no dimensions', () => {
  assert(isImageError(validateBase64Image(b64([0xff, 0xd8, 0xff]))));
});

// --- path handling ---------------------------------------------------------

Deno.test('storage paths are scoped to the user and ignore any client input', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  const path = storagePathFor(userId, 'jpg');
  assert(path.startsWith(`${userId}/`));
  assert(path.endsWith('.jpg'));
  assert(!path.includes('..'));
});

Deno.test('two calls never collide', () => {
  const a = storagePathFor('u', 'jpg');
  const b = storagePathFor('u', 'jpg');
  assert(a !== b);
});
