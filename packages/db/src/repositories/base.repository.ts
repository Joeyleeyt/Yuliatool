import type { Sql } from '../client.js';

/**
 * Base repository. Holds the connection + table identifier and provides the
 * handful of universally-shared queries. Concrete repositories add their own
 * domain queries using the protected `sql` tagged template (parameterized —
 * every value is bound, never string-concatenated).
 */
export abstract class BaseRepository<TRow extends { id: string }> {
  constructor(
    protected readonly sql: Sql,
    protected readonly table: string,
  ) {}

  async findById(id: string): Promise<TRow | null> {
    const rows = await this.sql<TRow[]>`
      select * from ${this.sql(this.table)} where id = ${id} limit 1`;
    return rows[0] ?? null;
  }

  async existsById(id: string): Promise<boolean> {
    const rows = await this.sql<{ exists: boolean }[]>`
      select exists(select 1 from ${this.sql(this.table)} where id = ${id}) as exists`;
    return rows[0]?.exists ?? false;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.sql`
      delete from ${this.sql(this.table)} where id = ${id} returning id`;
    return rows.count > 0;
  }
}
