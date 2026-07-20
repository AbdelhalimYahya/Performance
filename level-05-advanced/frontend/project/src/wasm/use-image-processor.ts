/**
 * useImageProcessor — React hook for WASM-backed image processing.
 *
 * Loads WASM on mount with useEffect.
 * Handles loading state, error state, WASM not supported gracefully.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadWasm, wasmState, grayscaleFilter, blurFilter, processImage } from './image-processor';

interface UseImageProcessorReturn {
  processImage: (imageData: Uint8Array) => { data: Uint8Array; durationMs: number; engine: 'wasm' | 'js' };
  grayscaleFilter: (imageData: Uint8Array) => { data: Uint8Array; durationMs: number; engine: 'wasm' | 'js' };
  blurFilter: (imageData: Uint8Array, radius: number) => { data: Uint8Array; durationMs: number; engine: 'wasm' | 'js' };
  isWasmReady: boolean;
  isWasmFailed: boolean;
  engine: 'wasm' | 'js' | 'loading';
  loadTime: number;
}

export function useImageProcessor(): UseImageProcessorReturn {
  const [isWasmReady, setIsWasmReady] = useState(false);
  const [isWasmFailed, setIsWasmFailed] = useState(false);
  const [engine, setEngine] = useState<'wasm' | 'js' | 'loading'>('loading');
  const [loadTime, setLoadTime] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const success = await loadWasm();
        if (cancelled) return;

        if (success) {
          setIsWasmReady(true);
          setEngine('wasm');
        } else {
          setIsWasmFailed(true);
          setEngine('js');
        }
        setLoadTime(wasmState.loadTime);
      } catch {
        if (!cancelled) {
          setIsWasmFailed(true);
          setEngine('js');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const processImageFn = useCallback((imageData: Uint8Array) => {
    return processImage(imageData);
  }, []);

  const grayscaleFilterFn = useCallback((imageData: Uint8Array) => {
    return grayscaleFilter(imageData);
  }, []);

  const blurFilterFn = useCallback((imageData: Uint8Array, radius: number) => {
    return blurFilter(imageData, radius);
  }, []);

  return {
    processImage: processImageFn,
    grayscaleFilter: grayscaleFilterFn,
    blurFilter: blurFilterFn,
    isWasmReady,
    isWasmFailed,
    engine,
    loadTime,
  };
}
