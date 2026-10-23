import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { GlobalID } from "@blazetrails/globalid";
import { include, rbInspect } from "@blazetrails/ruby-compat";
import "../active-job.js";
import { Base } from "../base.js";
import { EnqueueAfterTransactionCommit } from "../enqueue-after-transaction-commit.js";

if (!((process.env["AJ_ADAPTER"] ?? false) !== false)) process.env["AJ_ADAPTER"] = "inline";
await (
  {
    inline: () => import("./adapters/inline.js"),
    async: () => import("./adapters/async.js"),
    test: () => import("./adapters/test.js"),
  } as Record<string, () => Promise<unknown>>
)[process.env["AJ_ADAPTER"]!]();
registerSpecType(/(?:)/, ActiveSupportTestCase);
GlobalID.setApp("aj");
include(Base, EnqueueAfterTransactionCommit);
export function isAdapterIs(...adapterClassSymbols: string[]) {
  return adapterClassSymbols
    .map((x) => (Array.isArray(x) ? rbInspect(x) : String(x ?? "")))
    .includes(Base.queueAdapterName);
}
