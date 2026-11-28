export default async function setup(): Promise<void> {
  const { env: ENV } = await import("@blazetrails/ruby-compat/process-adapter");
  if (ENV["ISOLATION_TEST"] != null) return;
  const { Dir } = await import("@blazetrails/ruby-compat/dir");
  const { File } = await import("@blazetrails/ruby-compat/file");
  const { FileUtils } = await import("@blazetrails/ruby-compat/file-utils");
  const { getFs } = await import("@blazetrails/ruby-compat/fs-adapter");
  const { AppGenerator } = await import("../../../lib/generators/trails/app/app-generator.js");
  const { Paths, TRAILS_FRAMEWORK_ROOT } = await import("./paths.js");

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

  const applicationPath = File.join(appTemplatePath, "config/application.ts");
  const contents = await File.readAsync(applicationPath);
  await getFs().writeFile!(applicationPath, contents.replace(/^await Bundler\.require.*\n/m, ""));

  await FileUtils.lnSfAsync(
    File.join(TRAILS_FRAMEWORK_ROOT, "packages/trailties/node_modules"),
    File.join(TRAILS_FRAMEWORK_ROOT, "tmp/node_modules"),
  );

  const manifest = JSON.parse(await File.readAsync(File.join(appTemplatePath, "package.json"))) as {
    dependencies?: object;
  };
  await FileUtils.mkdirPAsync(File.join(appTemplatePath, "node_modules/@blazetrails"));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!name.startsWith("@blazetrails/")) continue;
    await FileUtils.lnSfAsync(
      File.join(TRAILS_FRAMEWORK_ROOT, "packages", name.slice("@blazetrails/".length)),
      File.join(appTemplatePath, "node_modules", name),
    );
  }
}
