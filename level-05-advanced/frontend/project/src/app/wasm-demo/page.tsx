'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useImageProcessor } from '@/wasm/use-image-processor';
import { grayscaleFilter as jsGrayscale, blurFilter as jsBlur } from '@/wasm/js-fallback';
import { grayscaleInWorker, blurInWorker } from '@/wasm/worker-bridge';

interface BenchmarkResult {
  operation: string;
  wasmMs: number;
  jsMs: number;
  speedup: string;
}

export default function WasmDemoPage() {
  const { grayscaleFilter, blurFilter, engine, loadTime, isWasmReady, isWasmFailed } = useImageProcessor();
  const [imageData, setImageData] = useState<Uint8Array | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [chartData, setChartData] = useState<Array<{ run: number; wasm: number; js: number }>>([]);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);

  // Handle file drop or selection
  const handleFile = useCallback(async (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    await new Promise((resolve) => { img.onload = resolve; });

    const canvas = canvasRef.current!;
    canvas.width = Math.min(img.width, 512);
    canvas.height = Math.min(img.height, 512);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setImageData(new Uint8Array(data.data));
    URL.revokeObjectURL(url);
  }, []);

  // Run benchmark: WASM vs JS for an operation
  const runBenchmark = useCallback(async (
    name: string,
    wasmFn: (data: Uint8Array) => { data: Uint8Array; durationMs: number },
    jsFn: (data: Uint8Array) => { data: Uint8Array; durationMs: number },
  ): Promise<BenchmarkResult> => {
    if (!imageData) throw new Error('No image loaded');

    // Run WASM
    const wasmResult = wasmFn(imageData);
    // Run JS
    const jsResult = jsFn(imageData);

    return {
      operation: name,
      wasmMs: Math.round(wasmResult.durationMs * 100) / 100,
      jsMs: Math.round(jsResult.durationMs * 100) / 100,
      speedup: jsResult.durationMs > 0
        ? `${(jsResult.durationMs / wasmResult.durationMs).toFixed(1)}x`
        : 'N/A',
    };
  }, [imageData]);

  // Run all operations
  const handleRunAll = useCallback(async () => {
    if (!imageData) return;
    setProcessing(true);

    const benchResults: BenchmarkResult[] = [];
    const chartPoints: Array<{ run: number; wasm: number; js: number }> = [];

    for (let run = 1; run <= 10; run++) {
      const gray = await runBenchmark('Grayscale', grayscaleFilter, jsGrayscale);
      const blur = await runBenchmark('Blur', (d) => blurFilter(d, 3), (d) => jsBlur(d, 3));

      chartPoints.push({ run, wasm: gray.wasmMs + blur.wasmMs, js: gray.jsMs + blur.jsMs });

      if (run === 1) {
        benchResults.push(gray, blur);
      }
    }

    setResults(benchResults);
    setChartData(chartPoints);
    setProcessing(false);
  }, [imageData, grayscaleFilter, blurFilter]);

  // Draw processed image to output canvas
  const drawResult = useCallback((data: Uint8Array) => {
    if (!outputRef.current || !canvasRef.current) return;
    const ctx = outputRef.current.getContext('2d')!;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    outputRef.current.width = w;
    outputRef.current.height = h;

    const imageDataObj = ctx.createImageData(w, h);
    imageDataObj.data.set(data);
    ctx.putImageData(imageDataObj, 0, 0);
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">WASM vs JS Image Processing</h1>
      <p className="text-gray-400 mb-6">Side-by-side comparison of WebAssembly and JavaScript performance.</p>

      {/* WASM Status */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm mb-8 ${
        engine === 'wasm' ? 'bg-green-900/30 text-green-400 border border-green-800' :
        engine === 'js' ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' :
        'bg-gray-800 text-gray-400 border border-gray-700'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          engine === 'wasm' ? 'bg-green-400' : engine === 'js' ? 'bg-yellow-400' : 'bg-gray-500 animate-pulse'
        }`} />
        {engine === 'loading' && 'Loading WASM...'}
        {engine === 'wasm' && `WASM ready (loaded in ${loadTime}ms)`}
        {engine === 'js' && 'WASM unavailable, using JS fallback'}
      </div>

      {/* Image Upload */}
      <div
        className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center mb-8 hover:border-gray-500 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <p className="text-gray-400 mb-2">Drag and drop an image, or</p>
        <label className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm cursor-pointer inline-block">
          Choose File
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>

      {/* Image Canvases */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Original</h3>
          <canvas ref={canvasRef} className="w-full bg-gray-900 rounded-lg border border-gray-800" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Processed</h3>
          <canvas ref={outputRef} className="w-full bg-gray-900 rounded-lg border border-gray-800" />
        </div>
      </div>

      {/* Run Button */}
      <button
        onClick={handleRunAll}
        disabled={!imageData || processing}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 px-6 py-3 rounded-lg font-medium mb-8"
      >
        {processing ? 'Running 10 benchmarks...' : 'Run WASM vs JS Benchmark (10 runs)'}
      </button>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Operation</th>
                <th className="text-right py-2">WASM (ms)</th>
                <th className="text-right py-2">JS (ms)</th>
                <th className="text-right py-2">Speedup</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-gray-800">
                  <td className="py-2">{r.operation}</td>
                  <td className="text-right text-green-400 font-mono">{r.wasmMs}</td>
                  <td className="text-right text-yellow-400 font-mono">{r.jsMs}</td>
                  <td className="text-right text-blue-400 font-mono">{r.speedup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Performance Chart — CSS bar chart */}
      {chartData.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Operation Times (10 runs)</h2>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-end gap-1 h-48">
              {chartData.map((d) => {
                const maxMs = Math.max(...chartData.map((c) => Math.max(c.wasm, c.js)));
                const wasmH = (d.wasm / maxMs) * 100;
                const jsH = (d.js / maxMs) * 100;
                return (
                  <div key={d.run} className="flex-1 flex gap-0.5 items-end">
                    <div
                      className="flex-1 bg-green-500 rounded-t"
                      style={{ height: `${wasmH}%` }}
                      title={`WASM: ${d.wasm.toFixed(1)}ms`}
                    />
                    <div
                      className="flex-1 bg-yellow-500 rounded-t"
                      style={{ height: `${jsH}%` }}
                      title={`JS: ${d.js.toFixed(1)}ms`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Run 1</span>
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded" /> WASM</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded" /> JS</span>
              </div>
              <span>Run 10</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
