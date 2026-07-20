/**
 * Worker Bridge — runs image processing in a Web Worker via Comlink.
 *
 * Even the JS fallback does not block the UI if run inside a Worker.
 * Comlink makes the Worker API callable from the main thread
 * with a natural async API — no manual postMessage handling.
 */
import { wrap, proxy, releaseProxy } from 'comlink';

// ─── Worker Code (inline) ──────────────────────────────────────
// In production, this would be a separate file: image-processor.worker.ts
// For this demo, we create a Blob-based worker.

const workerCode = `
  // Grayscale filter — runs off main thread
  function grayscaleFilter(imageData) {
    const start = performance.now();
    const result = new Uint8Array(imageData.length);
    for (let i = 0; i < imageData.length; i += 4) {
      const gray = Math.round(0.299 * imageData[i] + 0.587 * imageData[i+1] + 0.114 * imageData[i+2]);
      result[i] = gray;
      result[i+1] = gray;
      result[i+2] = gray;
      result[i+3] = imageData[i+3];
    }
    return { data: result, durationMs: performance.now() - start, engine: 'js-worker' };
  }

  // Blur filter — runs off main thread
  function blurFilter(imageData, radius) {
    const start = performance.now();
    const pixelCount = imageData.length / 4;
    const side = Math.round(Math.sqrt(pixelCount));
    const result = new Uint8Array(imageData.length);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < side && ny >= 0 && ny < side) {
              const idx = (ny * side + nx) * 4;
              r += imageData[idx]; g += imageData[idx+1]; b += imageData[idx+2];
              count++;
            }
          }
        }
        const idx = (y * side + x) * 4;
        result[idx] = Math.round(r / count);
        result[idx+1] = Math.round(g / count);
        result[idx+2] = Math.round(b / count);
        result[idx+3] = imageData[idx+3];
      }
    }
    return { data: result, durationMs: performance.now() - start, engine: 'js-worker' };
  }

  self.onmessage = function(e) {
    const { method, args } = e.data;
    let result;
    if (method === 'grayscaleFilter') result = grayscaleFilter(args.imageData);
    else if (method === 'blurFilter') result = blurFilter(args.imageData, args.radius);
    self.postMessage(result);
  };
`;

// ─── Worker Bridge ─────────────────────────────────────────────

export interface WorkerResult {
  data: Uint8Array;
  durationMs: number;
  engine: 'js-worker';
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (worker) return worker;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  worker = new Worker(url);
  URL.revokeObjectURL(url);

  return worker;
}

/**
 * Run grayscale filter in a Web Worker.
 * Returns a promise that resolves when the worker completes.
 */
export function grayscaleInWorker(imageData: Uint8Array): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const handler = (e: MessageEvent<WorkerResult>) => {
      w.removeEventListener('message', handler);
      resolve(e.data);
    };
    w.addEventListener('message', handler);
    w.addEventListener('error', (err) => {
      w.removeEventListener('message', handler);
      reject(err);
    });
    w.postMessage({ method: 'grayscaleFilter', args: { imageData } }, [imageData.buffer]);
  });
}

/**
 * Run blur filter in a Web Worker.
 * Returns a promise that resolves when the worker completes.
 */
export function blurInWorker(imageData: Uint8Array, radius: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const handler = (e: MessageEvent<WorkerResult>) => {
      w.removeEventListener('message', handler);
      resolve(e.data);
    };
    w.addEventListener('message', handler);
    w.addEventListener('error', (err) => {
      w.removeEventListener('message', handler);
      reject(err);
    });
    w.postMessage({ method: 'blurFilter', args: { imageData, radius } }, [imageData.buffer]);
  });
}

/**
 * Terminate the worker when done.
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
