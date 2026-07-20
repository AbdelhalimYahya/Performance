'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * HeavyChart — dynamically imported chart component.
 * Generates a line chart with 1000 data points using canvas.
 * This component is ~200KB when fully loaded with Chart.js.
 *
 * For this demo, we render directly to canvas to simulate a heavy component
 * without requiring Chart.js as a dependency.
 */
export default function HeavyChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderTime, setRenderTime] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const start = performance.now();
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Generate 1000 data points
    const dataPoints = 1000;
    const data: number[] = [];
    let value = 50;
    for (let i = 0; i < dataPoints; i++) {
      value += (Math.random() - 0.5) * 10;
      value = Math.max(0, Math.min(100, value));
      data.push(value);
    }

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + ((height - 2 * padding) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw line chart
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const xStep = (width - 2 * padding) / (dataPoints - 1);
    const yScale = (height - 2 * padding) / 100;

    for (let i = 0; i < dataPoints; i++) {
      const x = padding + i * xStep;
      const y = height - padding - data[i] * yScale;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw axes
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px monospace';
    ctx.fillText('100', 5, padding + 4);
    ctx.fillText('0', 15, height - padding + 15);
    ctx.fillText(`0`, padding, height - padding + 15);
    ctx.fillText(`${dataPoints}`, width - padding - 10, height - padding + 15);
    ctx.fillText(`${dataPoints} data points rendered in canvas`, padding, 20);

    setRenderTime(Math.round(performance.now() - start));
  }, []);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">Heavy Chart Component</h3>
        {renderTime !== null && (
          <span className="text-xs text-green-400 font-mono">Rendered in {renderTime}ms</span>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        className="w-full rounded bg-gray-900"
      />
    </div>
  );
}
