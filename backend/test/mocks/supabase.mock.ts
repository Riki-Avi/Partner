import type { SupabaseClient } from '@supabase/supabase-js';

export interface MockStore {
  users: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  corrections: Array<Record<string, unknown>>;
  user_progress: Array<Record<string, unknown>>;
  user_preferences: Array<Record<string, unknown>>;
  conversation_feedback: Array<Record<string, unknown>>;
  partner_recommendations: Array<Record<string, unknown>>;
  saved_phrases: Array<Record<string, unknown>>;
  adventures: Array<Record<string, unknown>>;
  adventure_characters: Array<Record<string, unknown>>;
  adventure_turns: Array<Record<string, unknown>>;
}

export function createMockStore(): MockStore {
  return {
    users: [],
    conversations: [],
    messages: [],
    corrections: [],
    user_progress: [],
    user_preferences: [],
    conversation_feedback: [],
    partner_recommendations: [],
    saved_phrases: [],
    adventures: [],
    adventure_characters: [],
    adventure_turns: [],
  };
}

class QueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderField?: string;
  private orderAscending = true;
  private limitCount?: number;
  private insertedRows: Array<Record<string, unknown>> = [];
  private updatedFields?: Record<string, unknown>;
  private isDelete = false;

  constructor(
    private readonly table: keyof MockStore,
    private readonly store: MockStore,
  ) {}

  eq(field: string, value: unknown): this {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field: string, value: unknown): this {
    this.filters.push((row) => row[field] !== value);
    return this;
  }

  in(field: string, values: unknown[]): this {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[field]));
    return this;
  }

  is(field: string, value: unknown): this {
    this.filters.push((row) => {
      if (value === null) {
        return row[field] === null || row[field] === undefined;
      }
      return row[field] === value;
    });
    return this;
  }

  gt(field: string, value: unknown): this {
    this.filters.push((row) => (row[field] as any) > (value as any));
    return this;
  }

  gte(field: string, value: unknown): this {
    this.filters.push((row) => (row[field] as any) >= (value as any));
    return this;
  }

  lt(field: string, value: unknown): this {
    this.filters.push((row) => (row[field] as any) < (value as any));
    return this;
  }

  lte(field: string, value: unknown): this {
    this.filters.push((row) => (row[field] as any) <= (value as any));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.orderField = field;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  select(_columns = '*'): this {
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>): this {
    const rows = Array.isArray(values) ? values : [values];
    this.insertedRows = rows.map((r) => this.applyDefaults(r));
    this.store[this.table].push(...this.insertedRows);
    return this;
  }

  upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    _options?: { onConflict?: string },
  ): this {
    const rows = Array.isArray(values) ? values : [values];
    const upserted: Array<Record<string, unknown>> = [];

    for (const val of rows) {
      const existingIdx = this.store[this.table].findIndex((item) => {
        if (val['id'] && item['id'] === val['id']) return true;
        if (val['user_id'] && val['conversation_id']) {
          return (
            item['user_id'] === val['user_id'] && item['conversation_id'] === val['conversation_id']
          );
        }
        if (val['user_id'] && !val['conversation_id'] && this.table === 'user_preferences') {
          return item['user_id'] === val['user_id'];
        }
        if (val['user_id'] && !val['conversation_id'] && this.table === 'user_progress') {
          return item['user_id'] === val['user_id'];
        }
        return false;
      });

      if (existingIdx >= 0) {
        this.store[this.table][existingIdx] = {
          ...this.store[this.table][existingIdx],
          ...val,
          updated_at: new Date().toISOString(),
        };
        upserted.push(this.store[this.table][existingIdx]);
      } else {
        const newRow = this.applyDefaults(val);
        this.store[this.table].push(newRow);
        upserted.push(newRow);
      }
    }

    this.insertedRows = upserted;
    return this;
  }

  update(fields: Record<string, unknown>): this {
    this.updatedFields = fields;
    return this;
  }

  delete(_options?: { count?: string }): this {
    this.isDelete = true;
    return this;
  }

  private applyDefaults(r: Record<string, unknown>): Record<string, unknown> {
    const now = new Date().toISOString();
    const id = (r['id'] as string) || `mock-${Math.random().toString(36).substring(2, 9)}`;
    const row: Record<string, unknown> = {
      ...r,
      id,
      created_at: r['created_at'] || now,
    };

    if (this.table === 'users') {
      row['level'] = r['level'] ?? 'beginner';
    } else if (this.table === 'conversations') {
      row['started_at'] = r['started_at'] ?? now;
      row['ended_at'] = r['ended_at'] ?? null;
      row['duration_seconds'] = r['duration_seconds'] ?? 0;
      row['language'] = r['language'] ?? 'en';
    } else if (this.table === 'messages') {
      row['timestamp'] = r['timestamp'] ?? now;
      row['has_corrections'] = r['has_corrections'] ?? false;
    } else if (this.table === 'partner_recommendations') {
      row['is_favorite'] = r['is_favorite'] ?? false;
    } else if (this.table === 'user_progress') {
      row['total_conversations'] = r['total_conversations'] ?? 0;
      row['total_time_minutes'] = r['total_time_minutes'] ?? 0;
      row['common_errors'] = r['common_errors'] ?? [];
    }
    return row;
  }

  private execute(): Array<Record<string, unknown>> {
    let rows = [...(this.store[this.table] ?? [])];

    if (this.isDelete) {
      const remaining: Array<Record<string, unknown>> = [];
      const deleted: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        if (this.filters.every((f) => f(row))) {
          deleted.push(row);
        } else {
          remaining.push(row);
        }
      }
      this.store[this.table] = remaining;
      return deleted;
    }

    if (this.updatedFields) {
      const updated: Array<Record<string, unknown>> = [];
      for (let i = 0; i < this.store[this.table].length; i++) {
        const item = this.store[this.table][i];
        if (this.filters.every((f) => f(item))) {
          this.store[this.table][i] = {
            ...item,
            ...this.updatedFields,
            updated_at: new Date().toISOString(),
          };
          updated.push(this.store[this.table][i]);
        }
      }
      return updated;
    }

    if (this.insertedRows.length > 0) {
      return this.insertedRows;
    }

    for (const filter of this.filters) {
      rows = rows.filter(filter);
    }

    if (this.orderField) {
      const f = this.orderField;
      const asc = this.orderAscending;
      rows.sort((a, b) => {
        if (a[f] === b[f]) return 0;
        if (a[f] === undefined) return 1;
        if (b[f] === undefined) return -1;
        return (a[f] > b[f] ? 1 : -1) * (asc ? 1 : -1);
      });
    }

    if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  async then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    _onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1> {
    const data = this.execute();
    const result = { data, error: null, count: data.length };
    return onfulfilled ? onfulfilled(result) : (result as any);
  }

  async single(): Promise<{ data: any; error: any }> {
    const rows = this.execute();
    if (rows.length === 0) {
      return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
    }
    return { data: rows[0], error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  }
}

export function createMockSupabaseClient(store = createMockStore()): SupabaseClient {
  const authUsers: Array<{
    id: string;
    email: string;
    password?: string;
    user_metadata?: Record<string, unknown>;
  }> = [];

  const mockClient = {
    from(table: keyof MockStore) {
      return new QueryBuilder(table, store);
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: authUsers }, error: null };
        },
        async createUser(params: {
          email: string;
          password?: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
        }) {
          const user = {
            id: `usr-${Math.random().toString(36).substring(2, 9)}`,
            email: params.email,
            password: params.password,
            user_metadata: params.user_metadata || {},
          };
          authUsers.push(user);
          return { data: { user }, error: null };
        },
        async updateUserById(id: string, params: { password?: string }) {
          const user = authUsers.find((u) => u.id === id);
          if (user && params.password) user.password = params.password;
          return { data: { user }, error: null };
        },
        async deleteUser(id: string) {
          const idx = authUsers.findIndex((u) => u.id === id);
          if (idx >= 0) authUsers.splice(idx, 1);
          return { data: null, error: null };
        },
        async signOut(_token: string) {
          return { error: null };
        },
      },
      async signUp(params: { email: string; password?: string }) {
        const user = {
          id: `usr-${Math.random().toString(36).substring(2, 9)}`,
          email: params.email,
          password: params.password,
        };
        authUsers.push(user);
        const session = { access_token: `mock-token-${user.id}`, user };
        return { data: { user, session }, error: null };
      },
      async signInWithPassword(params: { email: string; password?: string }) {
        const user = authUsers.find(
          (u) => u.email === params.email && u.password === params.password,
        );
        if (!user) {
          return {
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials' },
          };
        }
        const session = { access_token: `mock-token-${user.id}`, user };
        return { data: { user, session }, error: null };
      },
      async getUser(token: string) {
        if (!token.startsWith('mock-token-') && token !== 'valid-test-token') {
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }
        const userId = token.replace('mock-token-', '') || 'test-user-id';
        const user = authUsers.find((u) => u.id === userId) || {
          id: userId,
          email: 'test@example.com',
        };
        return { data: { user }, error: null };
      },
    },
  };

  return mockClient as unknown as SupabaseClient;
}
