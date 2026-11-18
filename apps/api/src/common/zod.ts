import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from './problem.filter';

/** Validates and transforms a request body with a Zod schema. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'validation_failed', {
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.message,
        })),
      });
    }
    return result.data;
  }
}

/** JSON Schema (draft 2020-12, as OpenAPI 3.1 uses) for a request body. */
export function bodySchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    unknown
  >;
  return rest;
}

export function responseSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'output' }) as Record<
    string,
    unknown
  >;
  return rest;
}
