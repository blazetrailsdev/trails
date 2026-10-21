import { getEnv } from "@blazetrails/activesupport";
import { GlobalID } from "@blazetrails/globalid";
import { include } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { EnqueueAfterTransactionCommit } from "../enqueue-after-transaction-commit.js";
import "./support/job-buffer.js";

GlobalID.setApp("aj");

const adapters: Record<string, () => Promise<unknown>> = {
  inline: () => import("./adapters/inline.js"),
  test: () => import("./adapters/test.js"),
};

const adapter = getEnv("AJ_ADAPTER", "inline");

await adapters[adapter]();

export function isAdapterIs(...adapterClassSymbols: string[]): boolean {
  return adapterClassSymbols.map(String).includes(Base.queueAdapterName);
}

include(Base, EnqueueAfterTransactionCommit);
