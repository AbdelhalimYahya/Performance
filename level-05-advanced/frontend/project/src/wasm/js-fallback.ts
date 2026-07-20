/**
 * JS Fallback — pure JavaScript implementation of image processing.
 * Identical API to the WASM wrapper. Used when WASM is unavailable.
 *
 * Each function measures its own execution time with performance.now().
 */

export interface ProcessResult {
  data: Uint8Array;
  durationMs: number;
  engine: 'js';
}

/**
 * Grayscale filter — applies luminance formula to each pixel.
 * Formula: 0.299*R + 0.587*G + 0.114*B (ITU-R BT.601)
 *
 * Time complexity: O(n) where n = pixel count
 */
export function grayscaleFilter(imageData: Uint8Array): ProcessResult {
  const start = performance.now();
  const result = new Uint8Array(imageData.length);

  // Process 4 bytes at a time (RGBA)
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];

    // Luminance formula — perceptually accurate grayscale
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    result[i] = gray;     // R
    result[i + 1] = gray; // G
    result[i + 2] = gray; // B
    result[i + 3] = a;    // A (preserve alpha)
  }

  return {
    data: result,
    durationMs: performance.now() - start,
    engine: 'js',
  };
}

/**
 * Box blur filter — O(n * radius^2) per pixel.
 * Each pixel averages its neighbors within the radius.
 *
 * For radius=5 and 1MP image: ~25 million operations.
 * This is where WASM typically shows 3-10x speedup.
 */
export function blurFilter(imageData: Uint8Array, radius: number): ProcessResult {
  const start = performance.now();

  // For a real implementation we'd need width/height.
  // Here we assume square image for the demo.
  const pixelCount = imageData.length / 4;
  const side = Math.round(Math.sqrt(pixelCount));
  const result = new Uint8Array(imageData.length);

  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      let r = 0, g = 0, b = 0, count = 0;

      // Sum neighbors within radius
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < side && ny >= 0 && ny < side) {
            const idx = (ny * side + nx) * 4;
            r += imageData[idx];
            g += imageData[idx + 1];
            b += imageData[idx + 2];
            count++;
          }
        }
      }

      const idx = (y * side + x) * 4;
      result[idx] = Math.round(r / count);
      result[idx + 1] = Math.round(g / count);
      result[idx + 2] = Math.round(b / count);
      result[idx + 3] = imageData[idx + 3]; // preserve alpha
    }
  }

  return {
    data: result,
    durationMs: performance.now() - start,
    engine: 'js',
  };
}

/**
 * Generic image processing — applies both grayscale and blur.
 */
export function processImage(imageData: Uint8Array): ProcessResult {
  const start = performance.now();
  const gray = grayscaleFilter(imageData);
  const blurred = blurFilter(gray.data, 2);

  return {
    data: blurred.data,
    durationMs: performance.now() - start,
    engine: 'js',
  };
}
