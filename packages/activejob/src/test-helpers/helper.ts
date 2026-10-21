import { GlobalID } from "@blazetrails/globalid";
import { Base } from "../base.js";
import "./support/job-buffer.js";

GlobalID.setApp("aj");

Base.setQueueAdapter("inline");

export function isAdapterIs(...adapterClassSymbols: string[]): boolean {
  return adapterClassSymbols.map(String).includes(Base.queueAdapterName);
}
