declare module 'drizzle-orm' {
  export const and: any;
  export const asc: any;
  export const desc: any;
  export const eq: any;
  export const inArray: any;
  export const isNull: any;
  export const sql: any;
  export function relations(
    table: any,
    relationsFn: (helpers: { one: (...args: any[]) => any; many: (...args: any[]) => any }) => any
  ): any;
}

declare module 'drizzle-orm/sqlite-core' {
  export function sqliteTable(
    name: string,
    columns: Record<string, any>,
    extraConfig?: (table: any) => any
  ): any;
  export function text(name: string): any;
  export function integer(name: string): any;
  export function index(name: string): { on: (...args: any[]) => any };
  export function uniqueIndex(name: string): { on: (...args: any[]) => any };
}

declare module 'drizzle-orm/sqlite-proxy' {
  export type RemoteCallback = (
    sql: string,
    params: unknown[] | undefined,
    method: string
  ) => Promise<{ rows?: unknown[] | null; lastID?: number; changes?: number }>;

  export type AsyncBatchRemoteCallback = (
    operations: Array<{ sql: string; params: unknown[] | undefined; method: string }>
  ) => Promise<unknown[]>;

  export type SqliteRemoteDatabase<TSchema = any> = any;

  export function drizzle(
    remote: RemoteCallback,
    batch: AsyncBatchRemoteCallback,
    options?: any
  ): SqliteRemoteDatabase<any>;
}

declare module 'drizzle-orm/migrator' {
  export function migrate(...args: any[]): Promise<void>;
  export function readMigrationFiles(...args: any[]): any;
}
