/**
 * A tiny D1Database stand-in over node:sqlite, running the real migration SQL.
 * Implements what the worker uses: prepare().bind().run()/all()/first(), and batch() as one transaction.
 * Every call is async, so concurrent callers interleave at the same points they would against D1.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Val = string | number | null | Uint8Array;

const norm = (v: unknown): Val => {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v as Val;
};

class Stmt {
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
    readonly params: Val[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args.map(norm));
  }
  runSync() {
    const s = this.db.prepare(this.sql);
    if (s.columns().length > 0) {
      const results = s.all(...this.params) as Record<string, unknown>[];
      return { success: true, results, meta: { changes: 0 } };
    }
    const r = s.run(...this.params);
    return { success: true, results: [] as Record<string, unknown>[], meta: { changes: Number(r.changes) } };
  }
  async run() {
    await Promise.resolve();
    return this.runSync();
  }
  async all<T>() {
    await Promise.resolve();
    return this.runSync() as unknown as { results: T[] };
  }
  async first<T>() {
    await Promise.resolve();
    return ((this.runSync().results[0] as T | undefined) ?? null) as T | null;
  }
}

export class SqliteD1 {
  readonly db: DatabaseSync;
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON");
    const dir = join(import.meta.dirname, "..", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) this.db.exec(readFileSync(join(dir, f), "utf8"));
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    await Promise.resolve();
    this.db.exec("BEGIN");
    try {
      const out = stmts.map((s) => s.runSync());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  /** Test helper: all rows of a table, ordered by id. */
  dump(table: string) {
    return this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  }
  asD1() {
    return this as unknown as D1Database;
  }
}
