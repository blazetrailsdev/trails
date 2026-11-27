import { TopLevel } from "@blazetrails/ruby-compat/object";
import { File } from "@blazetrails/ruby-compat/file";
import { APP_PATH, setAppPath } from "../app-path.js";

if (APP_PATH == null) {
  if (
    await File.isExistAsync(
      File.expandPath("test/dummy/config/application.ts", TopLevel.ENGINE_ROOT),
    )
  ) {
    setAppPath(File.expandPath("test/dummy/config/application.ts", TopLevel.ENGINE_ROOT));
  }
}

await import("../commands.js");
