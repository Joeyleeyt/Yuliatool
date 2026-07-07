import type { Sql } from '../client.js';
import type { UserRow } from '../types/index.js';
import { BaseRepository } from './base.repository.js';

export interface UpsertProfileInput {
  id: string; // must equal auth.users.id
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export class UserRepository extends BaseRepository<UserRow> {
  constructor(sql: Sql) {
    super(sql, 'users');
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.sql<UserRow[]>`
      select * from users where email = ${email} limit 1`;
    return rows[0] ?? null;
  }

  /** Idempotently ensure an app profile exists for an authenticated user. */
  async upsertProfile(input: UpsertProfileInput): Promise<UserRow> {
    const rows = await this.sql<UserRow[]>`
      insert into users (id, email, display_name, avatar_url)
      values (${input.id}, ${input.email}, ${input.displayName ?? null}, ${input.avatarUrl ?? null})
      on conflict (id) do update
        set email = excluded.email,
            display_name = coalesce(excluded.display_name, users.display_name),
            avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
            updated_at = now()
      returning *`;
    // Insert-or-update with RETURNING always yields exactly one row.
    return rows[0]!;
  }
}
