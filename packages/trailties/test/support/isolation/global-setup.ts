import { Dir, File, FileUtils, env as ENV, getFs } from "@blazetrails/ruby-compat";
import { AppGenerator } from "../../../lib/generators/trails/app/app-generator.js";
import { Paths, TRAILS_FRAMEWORK_ROOT } from "./paths.js";

export default async function setup(): Promise<void> {
  if (ENV["ISOLATION_TEST"] != null) return;

  const appTemplatePath = Paths.prototype.appTemplatePath();

  await FileUtils.rmRfAsync(appTemplatePath);
  await FileUtils.mkdirPAsync(appTemplatePath);

  const pwd = Dir.pwd();
  try {
    await new AppGenerator(
      [File.basename(appTemplatePath)],
      { skipInstall: true, quiet: true },
      { destinationRoot: File.dirname(appTemplatePath) },
    ).invokeAll();
  } finally {
    Dir.chdir(pwd);
  }
  await getFs().writeFile!(
    File.join(appTemplatePath, "config/boot.ts"),
    `import "@blazetrails/trailties/all";\n`,
  );

  await getFs().writeFile!(
    File.join(appTemplatePath, "config/storage.ts"),
    `export default {\n  local: {\n    service: "Disk",\n    root: "storage",\n  },\n  test: {\n    service: "Disk",\n    root: "tmp/storage",\n  },\n};\n`,
  );

  await FileUtils.mkdirPAsync(File.join(appTemplatePath, "app/javascript"));
  await getFs().writeFile!(File.join(appTemplatePath, "app/javascript/application.js"), "\n");

  await FileUtils.lnSfAsync(
    File.join(TRAILS_FRAMEWORK_ROOT, "packages/trailties/node_modules"),
    File.join(TRAILS_FRAMEWORK_ROOT, "tmp/node_modules"),
  );
}
