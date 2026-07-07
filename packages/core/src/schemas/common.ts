import { z } from 'zod';

/** Standard list pagination. Coerces query-string values. */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const UuidSchema = z.string().uuid();

/** Wrapper shape for paginated API responses. */
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
