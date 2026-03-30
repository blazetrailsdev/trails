import { afterAll } from "vitest";

// Suppress unhandled rejections from MariaDB/MySQL table-not-found errors
// that occur when lazy relation queries fire during test teardown.

type MysqlLikeError = Error & { code?: string; errno?: number };

function isMysqlTableNotFoundError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const err = reason as Partial<MysqlLikeError>;
  if (err.code === "ER_NO_SUCH_TABLE") return true;
  if (err.errno === 1146) return true;
  return false;
}

const HANDLER_KEY = Symbol.for("activerecord.mysql.unhandledRejectionHandler");

if (!(globalThis as any)[HANDLER_KEY]) {
  const handler = (reason: unknown) => {
    if (isMysqlTableNotFoundError(reason)) return;
    throw reason;
  };

  (globalThis as any)[HANDLER_KEY] = handler;
  process.on("unhandledRejection", handler);

  afterAll(() => {
    process.off("unhandledRejection", handler);
    delete (globalThis as any)[HANDLER_KEY];
  });
}
