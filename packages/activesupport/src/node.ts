import {
  getChildProcessAsync,
  getCryptoAsync,
  getHttpAsync,
  getOsAsync,
  getZlibAsync,
} from "@blazetrails/ruby-compat";

await Promise.all([
  getChildProcessAsync(),
  getCryptoAsync(),
  getHttpAsync(),
  getOsAsync(),
  getZlibAsync(),
]);
