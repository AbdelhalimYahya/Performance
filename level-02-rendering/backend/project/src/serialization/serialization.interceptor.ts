import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { fastJson } from './schemas/product.schema';

// ============================================================================
// Schema Registry
// Maps class/type constructors to their fast-json-stringify serializers.
// ============================================================================

const schemaRegistry = new Map<string, fastJson.JsonSchema>();

export function registerSchema(name: string, schema: fastJson.JsonSchema): void {
  schemaRegistry.set(name, schema);
}

const compiledSerializers = new Map<string, ReturnType<typeof fastJson>>();

function getSerializer(name: string): ReturnType<typeof fastJson> | null {
  if (compiledSerializers.has(name)) return compiledSerializers.get(name)!;
  const schema = schemaRegistry.get(name);
  if (!schema) return null;
  const serializer = fastJson(schema);
  compiledSerializers.set(name, serializer);
  return serializer;
}

// ============================================================================
// Serialization Interceptor
// Replaces NestJS default ClassSerializerInterceptor.
// Uses fast-json-stringify when a schema is registered for the return type,
// falls back to JSON.stringify for unregistered types.
// Adds X-Serialization-Method and X-Serialization-Time headers.
// ============================================================================

@Injectable()
export class SerializationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Schema name can be passed via query param, header, or decorator
    const schemaName: string =
      req.query._schema ||
      req.headers['x-schema-name'] ||
      context.getClass()?.name ||
      '';

    return next.handle().pipe(
      map((data) => {
        const start = performance.now();
        let method: string;
        let serialized: string;

        // Determine if we have a registered schema for this return type
        const serializer = getSerializer(schemaName);

        if (serializer) {
          try {
            serialized = serializer(data);
            method = 'fast-json-stringify';
          } catch {
            // Schema mismatch or invalid data — fall through to native
            serialized = JSON.stringify(data);
            method = 'native-fallback';
          }
        } else {
          serialized = JSON.stringify(data);
          method = 'JSON.stringify';
        }

        const duration = performance.now() - start;

        res.setHeader('X-Serialization-Method', method);
        res.setHeader('X-Serialization-Time', `${duration.toFixed(4)}ms`);

        return serialized;
      }),
    );
  }
}
