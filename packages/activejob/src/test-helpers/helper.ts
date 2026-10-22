import { getEnv } from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { include, LoadError, puts, setEnv, stdout } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { EnqueueAfterTransactionCommit } from "../enqueue-after-transaction-commit.js";
import "./support/job-buffer.js";

GlobalID.setApp("aj");

/** @noRailsEquivalent PERMANENT */
const adapters: Record<string, () => Promise<unknown>> = {
  async: () => import("./adapters/async.js"),
  inline: () => import("./adapters/inline.js"),
  test: () => import("./adapters/test.js"),
};

let adapter = getEnv("AJ_ADAPTER");
if (adapter == null) setEnv("AJ_ADAPTER", (adapter = "inline"));
puts.call(stdout, `Using ${adapter}`);

if (!Object.hasOwn(adapters, adapter)) {
  throw new LoadError(`cannot load such file -- adapters/${adapter}`);
}
await adapters[adapter]();

await import("@blazetrails/activesupport/testing/autorun");

export function isAdapterIs(...adapterClassSymbols: string[]): boolean {
  return adapterClassSymbols.map(String).includes(Base.queueAdapterName);
}

include(Base, EnqueueAfterTransactionCommit);
