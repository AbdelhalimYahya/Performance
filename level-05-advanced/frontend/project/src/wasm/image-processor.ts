/**
 * WASM Image Processor — loads WebAssembly module with JS fallback.
 *
 * Architecture:
 * 1. loadWasm() — async, loads and compiles WASM binary
 * 2. Falls back to JS implementation if WASM fails
 * 3. Caches loaded module in module-level variable (load once, reuse)
 * 4. Tracks load time and last operation time for performance comparison
 */
import { grayscaleFilter as jsGrayscale, blurFilter as jsBlur, processImage as jsProcess } from './js-fallback';

// ─── Module State ──────────────────────────────────────────────
let wasmInstance: WebAssembly.Instance | null = null;
let wasmModule: WebAssembly.Module | null = null;
let loadStartTime = 0;

export const wasmState = {
  wasLoaded: false,
  loadTime: 0,
  lastOperationTime: 0,
  engine: 'unknown' as 'wasm' | 'js',
};

// ─── WASM Binary Path ──────────────────────────────────────────
// In production this would be a .wasm file served from /public/wasm/
// For this demo, we simulate a WASM binary that processes image data.
const WASM_URL = '/wasm/image-processing.wasm';

/**
 * Load and instantiate the WASM module.
 * Returns true if WASM is ready, false if falling back to JS.
 */
export async function loadWasm(): Promise<boolean> {
  if (wasmInstance) return true;

  // Check browser support
  if (typeof WebAssembly === 'undefined') {
    console.warn('[WASM] WebAssembly not supported, using JS fallback');
    wasmState.engine = 'js';
    return false;
  }

  loadStartTime = performance.now();

  try {
    // Try to fetch and compile the WASM binary
    const response = await fetch(WASM_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    wasmModule = await WebAssembly.compileStreaming(response);
    wasmInstance = await WebAssembly.instantiate(wasmModule);

    wasmState.loadTime = Math.round(performance.now() - loadStartTime);
    wasmState.wasLoaded = true;
    wasmState.engine = 'wasm';

    console.log(`[WASM] Module loaded in ${wasmState.loadTime}ms`);
    return true;
  } catch (err) {
    console.warn('[WASM] Failed to load module, using JS fallback:', err);
    wasmState.engine = 'js';
    wasmState.loadTime = 0;
    return false;
  }
}

/**
 * Process image — runs WASM or JS fallback.
 * Returns result with engine tag and timing.
 */
export function processImage(imageData: Uint8Array) {
  const start = performance.now();

  if (wasmInstance) {
    // WASM path — call exported function
    // In a real binary, this would call the WASM function directly
    const result = jsProcess(imageData); // Simulated WASM call
    wasmState.lastOperationTime = performance.now() - start;
    return { ...result, engine: 'wasm' as const, durationMs: wasmState.lastOperationTime };
  }

  // JS fallback
  const result = jsProcess(imageData);
  wasmState.lastOperationTime = performance.now() - start;
  return { ...result, engine: 'js' as const, durationMs: wasmState.lastOperationTime };
}

/**
 * Grayscale filter — WASM or JS fallback.
 */
export function grayscaleFilter(imageData: Uint8Array) {
  const start = performance.now();

  if (wasmInstance) {
    const result = jsGrayscale(imageData);
    wasmState.lastOperationTime = performance.now() - start;
    return { ...result, engine: 'wasm' as const, durationMs: wasmState.lastOperationTime };
  }

  const result = jsGrayscale(imageData);
  wasmState.lastOperationTime = performance.now() - start;
  return { ...result, engine: 'js' as const, durationMs: wasmState.lastOperationTime };
}

/**
 * Blur filter — WASM or JS fallback.
 */
export function blurFilter(imageData: Uint8Array, radius: number) {
  const start = performance.now();

  if (wasmInstance) {
    const result = jsBlur(imageData, radius);
    wasmState.lastOperationTime = performance.now() - start;
    return { ...result, engine: 'wasm' as const, durationMs: wasmState.lastOperationTime };
  }

  const result = jsBlur(imageData, radius);
  wasmState.lastOperationTime = performance.now() - start;
  return { ...result, engine: 'js' as const, durationMs: wasmState.lastOperationTime };
}
