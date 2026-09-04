import {
  getChildProcessAsync,
  getCryptoAsync,
  getFsAsync,
  getHttpAsync,
  getOsAsync,
  getPathAsync,
  getZlibAsync,
} from "@blazetrails/ruby-compat";

await Promise.all([
  getChildProcessAsync(),
  getCryptoAsync(),
  getFsAsync(),
  getPathAsync(),
  getHttpAsync(),
  getOsAsync(),
  getZlibAsync(),
]);
