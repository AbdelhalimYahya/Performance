/**
 * Math utilities — individually exported named exports.
 * Each function is a separate ESM export that can be tree-shaken.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

export function factorial(n: number): number {
  if (n < 0) throw new Error('Factorial of negative number');
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

export function fibonacci(n: number): number {
  if (n < 0) throw new Error('Fibonacci of negative number');
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

// Generic process function for the dynamic import demo
export function processData(data: number[]): number[] {
  return data.map((x) => x * x + Math.sqrt(Math.abs(x)));
}
