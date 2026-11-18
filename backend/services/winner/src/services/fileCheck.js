// Decides the image type from the file's first bytes, not from the name or the browser's claim.
// A text file renamed to .jpg is rejected.
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageType(buffer) {
  if (buffer.length >= JPEG_START.length && buffer.subarray(0, JPEG_START.length).equals(JPEG_START)) {
    return "image/jpeg";
  }
  if (buffer.length >= PNG_START.length && buffer.subarray(0, PNG_START.length).equals(PNG_START)) {
    return "image/png";
  }
  return null;
}

module.exports = { detectImageType };
