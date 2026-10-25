// Is a StatementInvalid instance itself missing its methods?
import { StatementInvalid, AdapterError, QueryAborted } from "@blazetrails/activerecord/errors.js";

const e = new StatementInvalid("boom", { sql: "select 1", binds: [] });

console.log("[e1] typeof", typeof e);
console.log("[e2] name", String((e as unknown as Record<string, unknown>).name));
console.log("[e3] message", String((e as unknown as Record<string, unknown>).message));
console.log("[e4] setQuery is", typeof (e as unknown as Record<string, unknown>).setQuery);
console.log("[e5] instanceof StatementInvalid", e instanceof StatementInvalid);
console.log("[e6] instanceof AdapterError", e instanceof AdapterError);
console.log("[e7] instanceof QueryAborted", e instanceof QueryAborted);
console.log("[e8] instanceof Error", e instanceof Error);
console.log("[e9] sql", String((e as unknown as Record<string, unknown>).sql));

const q = new QueryAborted("aborted", { sql: "select 2", binds: [] });
console.log("[q1] setQuery is", typeof (q as unknown as Record<string, unknown>).setQuery);
console.log("[q2] instanceof StatementInvalid", q instanceof StatementInvalid);
