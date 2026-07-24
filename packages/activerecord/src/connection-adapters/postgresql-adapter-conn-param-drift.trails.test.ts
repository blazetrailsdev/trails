import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { createRequire } from "module";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";

// Trails-only guard (no Rails counterpart). Rails derives its conn_params
// allowlist at RUNTIME from the driver
// (postgresql_adapter.rb:330 — `conn_params.slice!(*valid_conn_param_keys)`
// where `valid_conn_param_keys` comes from `PG::Connection.conndefaults_hash`),
// so it can never drift. Ours (`PostgreSQLAdapter.VALID_CONN_PARAM_KEYS`) is a
// hand-maintained literal transcribed from node-pg's source, so it CAN drift:
//
//   1. pg adds a keyword  -> it lands outside the allowlist and is silently
//      dropped before reaching the driver ("option had no effect", not error).
//   2. pg removes a keyword (`Promise` and `connection` are already deprecated
//      with removal announced for pg@9, see client.js) -> the allowlist keeps
//      accepting a key that no longer does anything.
//
// This test re-derives the accepted-keyword set from the INSTALLED `pg` package
// and fails when VALID_CONN_PARAM_KEYS drifts from it in EITHER direction.
describe("PostgreSQLAdapter VALID_CONN_PARAM_KEYS drift guard (trails)", () => {
  const require = createRequire(import.meta.url);

  // The two pg source files whose config-key reads define the driver's accepted
  // keyword set. Named explicitly so a pg upgrade points at exactly what to
  // re-check. Verified against pg@8.20.0:
  //   - connection-parameters.js:63-127 — ConnectionParameters reads keys via
  //     `val('name', config)` and a handful of direct `config.name` accesses.
  //   - client.js:60-101 — the Client constructor reads its own keys off the
  //     raw config as `c.name`.
  const CONNECTION_PARAMETERS_JS = "pg/lib/connection-parameters.js";
  const CLIENT_JS = "pg/lib/client.js";

  // The exact pg version the extraction regexes below were verified against.
  // A version bump fails this assertion FIRST, forcing a human to re-read the
  // two source files and confirm the three access patterns (`val('x', config)`,
  // `config.x`, `c.x`) still capture every accepted keyword — and to handle any
  // removed key (see the deprecated-key note at the bottom of this file).
  const PINNED_PG_VERSION = "8.20.0";

  async function deriveDriverKeys(): Promise<Set<string>> {
    const connParamsSrc = await readFile(require.resolve(CONNECTION_PARAMETERS_JS), "utf-8");
    const clientSrc = await readFile(require.resolve(CLIENT_JS), "utf-8");

    const keys = new Set<string>();
    // ConnectionParameters: `val('name', config)`.
    for (const m of connParamsSrc.matchAll(/val\('([a-zA-Z_]+)'/g)) keys.add(m[1]);
    // ConnectionParameters: direct `config.name` reads (connectionString, ssl,
    // keepAlive, keepAliveInitialDelayMillis, connectionTimeoutMillis).
    for (const m of connParamsSrc.matchAll(/config\.([a-zA-Z_]+)/g)) keys.add(m[1]);
    // Client constructor: `c.name` reads (config is bound to `c`).
    for (const m of clientSrc.matchAll(/\bc\.([a-zA-Z_]+)/g)) keys.add(m[1]);
    return keys;
  }

  it("is pinned to the pg version its extraction was verified against", () => {
    expect(require("pg/package.json").version).toBe(PINNED_PG_VERSION);
  });

  it("accepts every keyword the installed pg driver reads, and no extras", async () => {
    const driverKeys = deriveKeysSorted(await deriveDriverKeys());
    const allowlist = deriveKeysSorted(
      (
        PostgreSQLAdapter as unknown as {
          VALID_CONN_PARAM_KEYS: ReadonlySet<string>;
        }
      ).VALID_CONN_PARAM_KEYS,
    );

    // Bidirectional: a symmetric-difference of {} means neither a pg addition
    // (dropped silently) nor a pg removal (accepted but dead) has slipped in.
    expect(allowlist).toEqual(driverKeys);
  });
});

function deriveKeysSorted(keys: Iterable<string>): string[] {
  return [...keys].sort();
}

// Deprecated-key policy (`Promise`, `connection`):
//
// Both are read by pg@8's Client constructor (client.js — `c.Promise`,
// `c.connection`) and are therefore in the derived set today, so they belong in
// VALID_CONN_PARAM_KEYS now. pg@9 has announced their removal
// (client.js:60-70 deprecation notices, "will be removed in pg@9.0"). When we
// upgrade to pg@9:
//   1. PINNED_PG_VERSION above fails first — re-verify the extraction.
//   2. `c.Promise` / `c.connection` will no longer appear in client.js, so
//      `deriveDriverKeys()` will drop them and the bidirectional test will fail
//      until they are removed from VALID_CONN_PARAM_KEYS.
// i.e. the guard MANDATES their removal at the pg@9 bump rather than leaving a
// dead key that silently accepts an option the driver no longer honours.
