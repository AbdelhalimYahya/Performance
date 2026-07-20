import { createWriteStream } from 'fs';
import { Writable } from 'stream';

/**
 * GENERATE TEST CSV
 *
 * Generates a CSV file using a writable stream.
 * Never builds the entire content in memory — writes row by row.
 * For 1M rows (~100MB), memory usage stays under 5MB.
 *
 * Output format: id,name,email,amount,category,date
 * Realistic fake data with varied categories and date ranges.
 */

const CATEGORIES = ['electronics', 'clothing', 'food', 'books', 'sports', 'home', 'garden', 'toys'];
const FIRST_NAMES = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(): string {
  const start = new Date(2023, 0, 1).getTime();
  const end = new Date(2024, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().split('T')[0];
}

export async function generateTestCSV(filePath: string, rows: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(filePath, { highWaterMark: 64 * 1024 });

    // Write header
    writeStream.write('id,name,email,amount,category,date\n');

    let written = 0;
    const batchSize = 1000;

    function writeBatch() {
      if (written >= rows) {
        writeStream.end();
        resolve();
        return;
      }

      const count = Math.min(batchSize, rows - written);
      let chunk = '';

      for (let i = 0; i < count; i++) {
        const id = written + i + 1;
        const firstName = randomFrom(FIRST_NAMES);
        const lastName = randomFrom(LAST_NAMES);
        const name = `${firstName} ${lastName}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${id}@example.com`;
        const amount = (Math.random() * 10000).toFixed(2);
        const category = randomFrom(CATEGORIES);
        const date = randomDate();

        chunk += `${id},${name},${email},${amount},${category},${date}\n`;
      }

      written += count;
      const canContinue = writeStream.write(chunk);

      if (canContinue) {
        setImmediate(writeBatch);
      } else {
        writeStream.once('drain', writeBatch);
      }
    }

    writeStream.on('error', reject);
    writeBatch();
  });
}
