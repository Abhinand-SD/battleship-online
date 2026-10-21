import { z } from 'zod';
import { AppError } from './errors';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

/** Parses untrusted input with a zod schema; failures become 400 INVALID_PAYLOAD with the issues as details. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown, what = 'payload'): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('INVALID_PAYLOAD', `Invalid ${what}`, { details: { issues: formatZodIssues(result.error) } });
  }
  return result.data;
}
