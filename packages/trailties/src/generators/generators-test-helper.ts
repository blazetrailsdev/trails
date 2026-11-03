import { File, FileUtils, TSE, rbFBinding } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/activerecord";
import { OrderedOptions } from "@blazetrails/activesupport";
import type { TestCase } from "./test-case.js";

export async function copyRoutes(this: TestCase): Promise<void> {
  const routes = await evaluateTemplate(
    File.expandPath("rails/app/templates/config/routes.ts.tt", import.meta.dirname),
    { options: new OrderedOptions() },
  );
  const destination = File.join(this.destinationRoot, "config");
  FileUtils.mkdirP(destination);
  File.write(File.join(destination, "routes.ts"), routes);
}

export async function withDatabaseConfiguration(
  databaseName: string | (() => Promise<void>) = "secondary",
  block?: () => Promise<void>,
): Promise<void> {
  if (typeof databaseName === "function") [databaseName, block] = ["secondary", databaseName];
  const originalConfigurations = Base.configurations();
  Base.configurations({
    test: {
      [databaseName]: {
        adapter: "sqlite3",
        database: `db/${databaseName}.sqlite3`,
        migrationsPaths: `db/${databaseName}_migrate`,
      },
    },
  });
  try {
    await block!();
  } finally {
    Base.configurations(originalConfigurations);
  }
}

export async function evaluateTemplate(
  file: string,
  locals: Record<string, unknown> = {},
): Promise<string> {
  const erb = new TSE(await File.readAsync(file), { trimMode: "-" });
  erb.filename = file;
  return erb.result(rbFBinding(locals));
}
