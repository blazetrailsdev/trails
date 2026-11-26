import { describe, expect, it } from "vitest";
import { OPTIONAL_ADAPTER_PEERS, consumerDiagnostics } from "./optional-peers-dts.js";

/**
 * RFC 0100, `activerecord-main-entry-dts-names-no-optional-adapter-peer`: the
 * main entry's declarations name no optional adapter peer. Needs `pnpm build`.
 */
describe("@blazetrails/activerecord declarations and the optional adapter peers", () => {
  it("typecheck import { Base } with none of the adapter ports installed", () => {
    const diagnostics = consumerDiagnostics(
      'import { Base } from "@blazetrails/activerecord";\nexport const b: typeof Base = Base;\n',
      OPTIONAL_ADAPTER_PEERS,
    );
    const missing = diagnostics.filter((d) => OPTIONAL_ADAPTER_PEERS.some((p) => d.includes(p)));
    expect(missing).toEqual([]);
  }, 120_000);

  it("type an adapter's namespace members once its port is installed", () => {
    const diagnostics = consumerDiagnostics(
      `import { ActiveRecord } from "@blazetrails/activerecord";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import "@blazetrails/activerecord/connection-adapters/mysql2-adapter.js";
const ca = ActiveRecord.ConnectionAdapters;
export const s: typeof SQLite3Adapter = ca.SQLite3Adapter;
export const p: string = ca.PostgreSQLAdapter.ADAPTER_NAME;
export const m: string = ca.Mysql2Adapter.ADAPTER_NAME;
export const o: string = ca.PostgreSQL.OID.Array.name;
export const d: unknown = ca.SQLite3.DatabaseStatements;
`,
      [],
    );
    expect(diagnostics.filter((d) => d.includes("__optional-peers-consumer__"))).toEqual([]);
  }, 120_000);
});
