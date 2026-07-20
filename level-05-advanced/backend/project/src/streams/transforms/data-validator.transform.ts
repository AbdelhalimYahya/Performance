import { Transform, TransformCallback } from 'stream';

/**
 * DATA VALIDATOR TRANSFORM
 *
 * Validates each parsed row against a schema.
 * Valid rows pass downstream; invalid rows are emitted via "invalidRow" event.
 *
 * Schema definition:
 * - required: field must be present and non-empty
 * - type: 'string' | 'number' | 'date'
 * - min/max: numeric range (for number fields)
 * - pattern: regex pattern (for string fields)
 *
 * This is where you'd add business rules:
 * - Email format validation
 * - Amount within acceptable range
 * - Category from allowed list
 *
 * Back-pressure: the transform back-pressure mechanism automatically
 * pauses the upstream when this transform's output buffer is full.
 */

interface FieldSchema {
  required?: boolean;
  type?: 'string' | 'number' | 'date';
  min?: number;
  max?: number;
  pattern?: RegExp;
}

interface RowSchema {
  [fieldName: string]: FieldSchema;
}

interface ValidationError {
  field: string;
  rule: string;
  value: any;
}

export class DataValidatorTransform extends Transform {
  public validCount = 0;
  public invalidCount = 0;
  public validationErrorsByField: Record<string, number> = {};

  constructor(private readonly schema: RowSchema) {
    super({ objectMode: true });
  }

  _transform(row: Record<string, string>, encoding: string, callback: TransformCallback): void {
    const errors: ValidationError[] = [];

    for (const [field, rules] of Object.entries(this.schema)) {
      const value = row[field];

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, rule: 'required', value });
        continue;
      }

      // Skip further checks if field is optional and empty
      if ((value === undefined || value === null || value === '') && !rules.required) {
        continue;
      }

      // Type check
      if (rules.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push({ field, rule: 'type:number', value });
          continue;
        }
        // Range check
        if (rules.min !== undefined && num < rules.min) {
          errors.push({ field, rule: 'min', value });
        }
        if (rules.max !== undefined && num > rules.max) {
          errors.push({ field, rule: 'max', value });
        }
      }

      if (rules.type === 'date' && isNaN(Date.parse(value))) {
        errors.push({ field, rule: 'type:date', value });
      }

      // Pattern check
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({ field, rule: 'pattern', value });
      }
    }

    if (errors.length === 0) {
      this.validCount++;
      this.push(row);
    } else {
      this.invalidCount++;
      for (const err of errors) {
        this.validationErrorsByField[err.field] = (this.validationErrorsByField[err.field] || 0) + 1;
      }
      this.emit('invalidRow', { row, errors });
    }

    callback();
  }
}

/**
 * Default schema for the test CSV format:
 * id, name, email, amount, category, date
 */
export const DEFAULT_CSV_SCHEMA: RowSchema = {
  id: { required: true, type: 'number', min: 1 },
  name: { required: true, type: 'string', min: 1 },
  email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  amount: { required: true, type: 'number', min: 0, max: 1000000 },
  category: { required: true, type: 'string' },
  date: { required: true, type: 'date' },
};
