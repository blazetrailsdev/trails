import { File, FileUtils, TSE, rbFBinding } from "@blazetrails/ruby-compat";
import type { TestCase } from "./test-case.js";

export async function copyRoutes(this: TestCase): Promise<void> {
  const routes = await evaluateTemplate(
    File.expandPath("rails/app/templates/config/routes.ts.tt", import.meta.dirname),
  );
  const destination = File.join(this.destinationRoot, "config");
  FileUtils.mkdirP(destination);
  File.write(File.join(destination, "routes.ts"), routes);
}

export async function evaluateTemplate(
  file: string,
  locals: Record<string, unknown> = {},
): Promise<string> {
  const erb = new TSE(await File.readAsync(file), { trimMode: "-" });
  erb.filename = file;
  return erb.result(rbFBinding(locals));
}
