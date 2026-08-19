import { promises as fs } from "node:fs";
import { serializeBaseline } from "./baseline-json.js";

const p = "scripts/api-compare/call-mismatches-exclude/activerecord/transactions.json";
const rows = JSON.parse(await fs.readFile(p, "utf8")) as Array<Record<string, string>>;

const drop = new Set([
  "after_commit|set_callback",
  "after_commit|set_options_for_callbacks!",
  "after_create_commit|set_callback",
  "after_create_commit|set_options_for_callbacks!",
  "after_destroy_commit|set_callback",
  "after_destroy_commit|set_options_for_callbacks!",
  "after_rollback|set_callback",
  "after_rollback|set_options_for_callbacks!",
  "after_save_commit|set_callback",
  "after_save_commit|set_options_for_callbacks!",
  "after_update_commit|set_callback",
  "after_update_commit|set_options_for_callbacks!",
  "before_commit|set_callback",
  "before_commit|set_options_for_callbacks!",
]);

const reasons: Record<string, string> = {
  "add_to_transaction|with_connection":
    "Reviewed (RFC 0106 wave 4c): trails resolves the adapter through `threadedConnectionFor(ctor) ?? ctor.connection` instead of the `with_connection` block form, which the pool-checkout convergence (RFC 0073) owns; converging here would fork that flip.",
  "has_transactional_callbacks?|empty?":
    "Reviewed (RFC 0106 wave 4c): trails has no `CallbackChain#empty?` — `peekCallbackChain` returns the raw chain, so emptiness is spelled `entries.length > 0`. Converges when the chain object grows the Rails predicate.",
  "restore_transaction_record_state|map":
    "Reviewed (RFC 0106 wave 4c): Rails `map`s the composite primary key back onto the restored attributes; trails restores the snapshot object wholesale, so there is no per-key projection to spell.",
  "rolledback!|restore_transaction_record_state":
    "Reviewed (RFC 0106 wave 4c): the call IS made — as the aliased import `_restoreTransactionRecordState.call(this, forceRestoreState)` — and the extractor keys on the local identifier, not the import binding.",
  "set_options_for_callbacks!|merge!":
    "Reviewed (RFC 0106 wave 4c): Ruby's `args.extract_options!.merge!(enforced_options)` mutates the extracted hash in place; TS returns a fresh merged object via spread because the caller binds the result straight into `set_callback`, so there is no in-place `merge!` to name.",
};

const kept = rows.filter((r) => !drop.has(`${r.rubyName}|${r.call}`));
kept.push({
  package: "activerecord",
  tsFile: "transactions.ts",
  rubyName: "set_options_for_callbacks!",
  call: "merge!",
  reason: "",
});
for (const r of kept) {
  const key = `${r.rubyName}|${r.call}`;
  if (reasons[key]) r.reason = reasons[key];
}
kept.sort((a, b) =>
  a.rubyName === b.rubyName ? a.call.localeCompare(b.call) : a.rubyName.localeCompare(b.rubyName),
);
await fs.writeFile(p, serializeBaseline(kept));
console.log("rows:", kept.length);
