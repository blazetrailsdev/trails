import { getChildProcessAsync } from "@blazetrails/ruby-compat/child-process-adapter";
import { getCryptoAsync } from "@blazetrails/ruby-compat/crypto-adapter";
import { getHttpAsync } from "@blazetrails/ruby-compat/http-adapter";
import { getOsAsync } from "@blazetrails/ruby-compat/os-adapter";
import { getZlibAsync } from "@blazetrails/ruby-compat/zlib-adapter";

await Promise.all([
  getChildProcessAsync(),
  getCryptoAsync(),
  getHttpAsync(),
  getOsAsync(),
  getZlibAsync(),
]);
