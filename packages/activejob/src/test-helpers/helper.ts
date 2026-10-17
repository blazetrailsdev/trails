import { GlobalID } from "@blazetrails/globalid";
import { rtest, include, rbObjAsString } from "@blazetrails/ruby-compat";
import "../active-job.js";
import { Base } from "../base.js";
import { EnqueueAfterTransactionCommit } from "../enqueue-after-transaction-commit.js";

if (!rtest(process.env["AJ_ADAPTER"])) process.env["AJ_ADAPTER"] = "inline";
await (
  {
    inline: () => import("./adapters/inline.js"),
    async: () => import("./adapters/async.js"),
    test: () => import("./adapters/test.js"),
  } as Record<string, () => Promise<unknown>>
)[process.env["AJ_ADAPTER"]]();
GlobalID.setApp("aj");
include(Base, EnqueueAfterTransactionCommit);
export function isAdapterIs(...adapterClassSymbols: any[]): any {
  return adapterClassSymbols.map((x: any) => rbObjAsString(x)).includes(Base.queueAdapterName());
}
