import { getChildProcessAsync } from "./child-process-adapter.js";
import { getCryptoAsync, getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { getHttpAsync } from "./http-adapter.js";
import { getOsAsync } from "./os-adapter.js";

await Promise.all([
  getChildProcessAsync(),
  getCryptoAsync(),
  getFsAsync(),
  getPathAsync(),
  getHttpAsync(),
  getOsAsync(),
]);
