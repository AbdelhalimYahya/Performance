import { Transform, TransformCallback } from 'stream';

/**
 * CSV PARSER TRANSFORM
 *
 * Handles the tricky part of streaming CSV: chunk boundaries.
 * A CSV row can be split across two consecutive chunks:
 *   chunk 1: "1,John Doe,john@e"
 *   chunk 2: "xample.com,100\n2,Jane..."
 *
 * Solution: buffer incomplete lines across chunks.
 * - Split chunk by newline
 * - First element is appended to leftover from previous chunk
 * - Last element may be incomplete → save as new leftover
 *
 * Events:
 * - "header": emitted once when first row is parsed (column names)
 * - Data: parsed row objects pushed downstream
 *
 * Counters for monitoring:
 * - rowsProcessed: total rows successfully parsed
 * - bytesProcessed: total bytes received
 * - parseErrors: rows that couldn't be parsed
 */
export class CsvParserTransform extends Transform {
  private leftover = '';
  private headers: string[] | null = null;
  public rowsProcessed = 0;
  public bytesProcessed = 0;
  public parseErrors = 0;

  constructor(private readonly delimiter = ',') {
    super({ objectMode: true });
  }

  _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
    this.bytesProcessed += chunk.length;

    // Decode buffer to string and prepend leftover from previous chunk
    const text = this.leftover + chunk.toString('utf-8');
    const lines = text.split('\n');

    // Last element may be incomplete — save as leftover
    this.leftover = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      const fields = line.split(this.delimiter);

      // First row is headers
      if (!this.headers) {
        this.headers = fields.map((f) => f.trim());
        this.emit('header', this.headers);
        continue;
      }

      try {
        // Map fields to header names
        const row: Record<string, string> = {};
        for (let i = 0; i < this.headers.length; i++) {
          row[this.headers[i]] = (fields[i] || '').trim();
        }
        this.rowsProcessed++;
        this.push(row);
      } catch {
        this.parseErrors++;
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    // Process any remaining leftover
    if (this.leftover.trim() && this.headers) {
      try {
        const fields = this.leftover.split(this.delimiter);
        const row: Record<string, string> = {};
        for (let i = 0; i < this.headers.length; i++) {
          row[this.headers[i]] = (fields[i] || '').trim();
        }
        this.rowsProcessed++;
        this.push(row);
      } catch {
        this.parseErrors++;
      }
    }
    callback();
  }
}
