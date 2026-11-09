import {
  Dir,
  File,
  FileUtils,
  JSON,
  TSE,
  rbFBinding,
  rbFSystem,
  stdout,
  type Hash,
} from "@blazetrails/ruby-compat";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { assertFile } from "../../lib/generators/testing/assertions.js";
import { Base } from "@blazetrails/activerecord";
import { OrderedOptions } from "@blazetrails/activesupport";
import { silenceStream } from "@blazetrails/activesupport/testing/stream";
import type { TestCase } from "../../lib/generators/test-case.js";

export async function copyRoutes(this: TestCase): Promise<void> {
  const routes = await evaluateTemplate(
    File.expandPath(
      "../../lib/generators/trails/app/templates/config/routes.ts.tt",
      import.meta.dirname,
    ),
    { options: new OrderedOptions() },
  );
  const destination = File.join(this.destinationRoot, "config");
  FileUtils.mkdirP(destination);
  File.write(File.join(destination, "routes.ts"), routes);
}

export async function copyDockerfile(this: TestCase): Promise<void> {
  const dockerfile = File.expandPath("../fixtures/generators/Dockerfile.test", import.meta.dirname);
  const destination = File.join(this.destinationRoot);
  File.write(File.join(destination, "Dockerfile"), await File.readAsync(dockerfile));
}

export async function copyDevcontainerFiles(this: TestCase): Promise<void> {
  const destination = File.join(this.destinationRoot, ".devcontainer");
  FileUtils.mkdirP(destination);

  const devcontainerJson = await File.readAsync(
    File.expandPath("../fixtures/generators/.devcontainer/devcontainer.json", import.meta.dirname),
  );
  File.write(File.join(destination, "devcontainer.json"), devcontainerJson);

  const composeYaml = await File.readAsync(
    File.expandPath("../fixtures/generators/.devcontainer/compose.yaml", import.meta.dirname),
  );
  File.write(File.join(destination, "compose.yaml"), composeYaml);
}

export async function copyMinimalDevcontainerComposeFile(this: TestCase): Promise<void> {
  const destination = File.join(this.destinationRoot, ".devcontainer");
  FileUtils.mkdirP(destination);

  const composeYaml = await File.readAsync(
    File.expandPath(
      "../fixtures/generators/.devcontainer/compose-minimal.yaml",
      import.meta.dirname,
    ),
  );
  File.write(File.join(destination, "compose.yaml"), composeYaml);
}

export async function assertComposeFile(
  this: TestCase,
  block: (composeConfig: Hash<string, any>) => unknown,
): Promise<void> {
  await assertFile.call(this, ".devcontainer/compose.yaml", (content) =>
    block(YAML.load(content) as Hash<string, any>),
  );
}

export async function assertDevcontainerJsonFile(
  this: TestCase,
  block: (content: Record<string, any>) => unknown,
): Promise<void> {
  await assertFile.call(this, ".devcontainer/devcontainer.json", (content) =>
    block(JSON.parse(content) as Record<string, any>),
  );
}

export async function withDatabaseConfiguration(
  databaseName = "secondary",
  block: () => Promise<void>,
): Promise<void> {
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
    await block();
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

export async function runAppUpdate(
  this: TestCase,
  appRoot: string = this.destinationRoot,
  { flags = "--force" }: { flags?: string } = {},
): Promise<void> {
  await Dir.chdir(appRoot, async () => {
    const frameworkRoot = File.expandPath("../..", import.meta.dirname);
    await FileUtils.mkdirPAsync("node_modules/@blazetrails");
    await FileUtils.lnSfAsync(
      [
        frameworkRoot,
        ...(await Dir.globAsync(File.join(frameworkRoot, "node_modules/@blazetrails/*"))),
      ],
      "node_modules/@blazetrails",
    );

    await silenceStream(stdout, () =>
      rbFSystem(`bin/trails app:update ${flags}`, { exception: true }),
    );
  });
}
