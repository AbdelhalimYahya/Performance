/**
 * Index Advisor Service — analyzes SQL queries and suggests indexes.
 *
 * Uses heuristic analysis to detect:
 * - WHERE columns that would benefit from an index
 * - ORDER BY columns that need index support
 * - Composite index opportunities (multiple columns in WHERE)
 * - Partial index candidates (constant WHERE conditions)
 * - Expression index needs (functions in WHERE)
 *
 * This is a lightweight alternative to pg_stat_statements + manual analysis.
 */
import { Injectable, Logger } from '@nestjs/common';

export interface IndexSuggestion {
  suggestedIndexes: string[];
  reasoning: string[];
  estimatedImpact: 'high' | 'medium' | 'low';
}

@Injectable()
export class IndexAdvisorService {
  private readonly logger = new Logger(IndexAdvisorService.name);

  /**
   * Analyze a SQL query and suggest indexes.
   *
   * @param sql - The SQL query to analyze
   * @returns Suggested indexes with reasoning and estimated impact
   */
  analyzeQueryForIndexes(sql: string): IndexSuggestion {
    const normalizedSql = sql.trim().replace(/\s+/g, ' ').toLowerCase();
    const suggestedIndexes: string[] = [];
    const reasoning: string[] = [];

    // Extract table name from FROM clause
    const tableMatch = normalizedSql.match(/from\s+(\w+)/);
    const table = tableMatch ? tableMatch[1] : 'unknown';

    // ─── Analyze WHERE clause ─────────────────────────────────
    const whereColumns = this.extractWhereColumns(normalizedSql);
    if (whereColumns.length > 0) {
      // Single column WHERE → B-tree index
      if (whereColumns.length === 1) {
        const col = whereColumns[0];
        suggestedIndexes.push(
          `CREATE INDEX idx_${table}_${col} ON ${table} (${col});`,
        );
        reasoning.push(
          `WHERE clause filters on '${col}' — a B-tree index will convert Seq Scan to Index Scan.`,
        );
      }

      // Multiple columns → composite index (equality first, then range)
      if (whereColumns.length > 1) {
        const compositeCols = whereColumns.join(', ');
        suggestedIndexes.push(
          `CREATE INDEX idx_${table}_composite ON ${table} (${compositeCols});`,
        );
        reasoning.push(
          `Multiple WHERE columns (${compositeCols}) — composite index is more efficient than individual indexes. ` +
          `Column order: equality columns first, then range/sort.`,
        );
      }
    }

    // ─── Analyze ORDER BY clause ──────────────────────────────
    const orderByColumns = this.extractOrderByColumns(normalizedSql);
    if (orderByColumns.length > 0) {
      // If ORDER BY columns differ from WHERE columns, add them to the index
      const newCols = orderByColumns.filter((c) => !whereColumns.includes(c));
      if (newCols.length > 0) {
        suggestedIndexes.push(
          `CREATE INDEX idx_${table}_sort ON ${table} (${newCols.join(', ')});`,
        );
        reasoning.push(
          `ORDER BY on ${newCols.join(', ')} — index eliminates filesort operation.`,
        );
      }
    }

    // ─── Detect expression indexes ───────────────────────────
    const functionCalls = this.extractFunctionCalls(normalizedSql);
    if (functionCalls.length > 0) {
      for (const func of functionCalls) {
        suggestedIndexes.push(
          `CREATE INDEX idx_${table}_${func.function}_${func.column} ON ${table} (${func.function}(${func.column}));`,
        );
        reasoning.push(
          `Function '${func.function}' applied to '${func.column}' in WHERE — ` +
          `expression index pre-computes the result.`,
        );
      }
    }

    // ─── Detect partial index candidates ─────────────────────
    const constantConditions = this.extractConstantConditions(normalizedSql);
    if (constantConditions.length > 0 && whereColumns.length > 0) {
      const whereClause = constantConditions.map((c) => `${c.column} ${c.op} ${c.value}`).join(' AND ');
      suggestedIndexes.push(
        `CREATE INDEX idx_${table}_partial ON ${table} (${whereColumns.join(', ')}) WHERE ${whereClause};`,
      );
      reasoning.push(
        `Constant condition '${whereClause}' detected — ` +
        `partial index reduces index size by filtering rows at index creation.`,
      );
    }

    // ─── Estimate impact ─────────────────────────────────────
    const estimatedImpact = this.estimateImpact(normalizedSql, suggestedIndexes);

    return {
      suggestedIndexes,
      reasoning,
      estimatedImpact,
    };
  }

  /**
   * Extract column names from WHERE clause.
   * Matches patterns like: WHERE col = X, WHERE col > X, WHERE col IN (...)
   */
  private extractWhereColumns(sql: string): string[] {
    const columns: string[] = [];
    const whereMatch = sql.match(/where\s+(.+?)(?:\s+order\s+by|\s+group\s+by|\s+limit|\s+offset|$)/i);
    if (!whereMatch) return columns;

    const whereClause = whereMatch[1];

    // Match: column operator value
    const colPattern = /(\w+)\s*(?:=|>|<|>=|<=|<>|!=|in|like|is)/gi;
    let match;
    while ((match = colPattern.exec(whereClause)) !== null) {
      const col = match[1];
      // Exclude SQL keywords
      if (!['and', 'or', 'not', 'null', 'true', 'false'].includes(col)) {
        columns.push(col);
      }
    }

    return [...new Set(columns)];
  }

  /**
   * Extract column names from ORDER BY clause.
   */
  private extractOrderByColumns(sql: string): string[] {
    const columns: string[] = [];
    const orderMatch = sql.match(/order\s+by\s+(.+?)(?:\s+limit|\s+offset|$)/i);
    if (!orderMatch) return columns;

    const orderClause = orderMatch[1];
    const parts = orderClause.split(',').map((p) => p.trim());

    for (const part of parts) {
      const col = part.split(/\s+/)[0]; // strip ASC/DESC
      if (col && !['asc', 'desc', 'nulls', 'first', 'last'].includes(col.toLowerCase())) {
        columns.push(col);
      }
    }

    return columns;
  }

  /**
   * Extract function calls from WHERE clause.
   * Matches: LOWER(col), UPPER(col), EXTRACT(part FROM col), etc.
   */
  private extractFunctionCalls(
    sql: string,
  ): Array<{ function: string; column: string }> {
    const calls: Array<{ function: string; column: string }> = [];
    const pattern = /(\w+)\((\w+)\)/gi;
    let match;

    while ((match = pattern.exec(sql)) !== null) {
      const func = match[1].toUpperCase();
      const column = match[2];

      // Only index known functions
      if (['LOWER', 'UPPER', 'TRIM', 'LENGTH', 'ABS', 'ROUND'].includes(func)) {
        calls.push({ function: func.toLowerCase(), column });
      }
    }

    return calls;
  }

  /**
   * Extract constant conditions (e.g., isActive = true, status = 'active').
   * These are candidates for partial indexes.
   */
  private extractConstantConditions(
    sql: string,
  ): Array<{ column: string; op: string; value: string }> {
    const conditions: Array<{ column: string; op: string; value: string }> = [];
    const pattern = /(\w+)\s*(=|is)\s*(true|false|null|'[^']*'|\d+)/gi;
    let match;

    while ((match = pattern.exec(sql)) !== null) {
      conditions.push({
        column: match[1],
        op: match[2],
        value: match[3],
      });
    }

    return conditions;
  }

  /**
   * Estimate the impact of suggested indexes based on query complexity.
   */
  private estimateImpact(
    sql: string,
    suggestions: string[],
  ): 'high' | 'medium' | 'low' {
    if (suggestions.length === 0) return 'low';

    // High impact: large table with multiple WHERE columns
    if (suggestions.length >= 3) return 'high';

    // Check for LIKE with leading wildcard (index won't help)
    if (sql.includes("like '%")) return 'low';

    // Check for OFFSET (cursor pagination would be better)
    if (sql.includes('offset')) return 'high';

    // Check for functions in WHERE (expression index needed)
    if (sql.match(/(lower|upper|trim|abs)\(/i)) return 'high';

    return 'medium';
  }
}
