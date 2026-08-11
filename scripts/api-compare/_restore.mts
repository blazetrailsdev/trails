import * as fs from "fs/promises";
import { serializeBaseline } from "./baseline-json.js";

const p =
  "scripts/api-compare/call-mismatches-exclude/activerecord/connection-adapters/abstract/connection-pool.json";
const rows = JSON.parse(await fs.readFile(p, "utf-8"));
rows.push({
  package: "activerecord",
  tsFile: "connection-adapters/abstract/connection-pool.ts",
  rubyName: "checkout",
  call: "synchronize",
  reason:
    "Ruby wraps both arms of checkout in a mutex (connection_pool.rb:547-579: " +
    "@pinned_connection.lock.synchronize on the pinned branch, synchronize around " +
    "try_to_checkout_new_connection). NOT permanent, unlike the rest of this file's " +
    "synchronize rows: the ported checkout is async and awaits verifyBang and " +
    "_available.poll BEFORE mutating _connections and _checkedOut, so two concurrent " +
    "checkouts can interleave in exactly the window the mutex closes. Convergeable, " +
    "and gated on the async-checkout divergence (RFC 0023-surfaced-deviations / " +
    "converge-connection-pool-checkout-lease-async).",
});
rows.sort((a: any, b: any) => (`${a.rubyName} ${a.call}` < `${b.rubyName} ${b.call}` ? -1 : 1));
await fs.writeFile(p, serializeBaseline(rows));
