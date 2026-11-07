import { File } from "@blazetrails/ruby-compat";
import { APP_PATH, ENGINE_ROOT, setAppPath } from "../app-path.js";

if (APP_PATH == null) {
  if (await File.isExistAsync(File.expandPath("test/dummy/config/application.ts", ENGINE_ROOT))) {
    setAppPath(File.expandPath("test/dummy/config/application.ts", ENGINE_ROOT));
  }
}

await import("../commands.js");
