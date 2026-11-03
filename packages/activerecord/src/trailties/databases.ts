import { DSL } from "@blazetrails/rake";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import {
  File,
  RuntimeError,
  STDOUT,
  TopLevel,
  block,
  env as ENV,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { Migration, Migrator, type MigrationProxy } from "../migration.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";

DSL.namespace("db", () => {
  DSL.task(
    { load_config: "environment" },
    block(() => {
      if (Base.configurations().empty) {
        Base.configurations(DatabaseTasks.databaseConfiguration!);
      }

      Migrator.migrationsPaths = DatabaseTasks.migrationsPaths;
    }),
  );
});

DSL.namespace("railties", () => {
  DSL.namespace("install", () => {
    DSL.task(
      { migrations: "db:load_config" },
      block(async () => {
        const toLoad = isBlank(ENV["FROM"]) ? "all" : ENV["FROM"]!.split(",").map((s) => s.trim());
        const railties: Record<string, string> = {};
        for (const railtie of TopLevel.Trails!.application!.migrationRailties()) {
          if (!(toLoad === "all" || toLoad.includes(railtie.railtieName))) continue;

          let path: string | undefined;
          if (
            rbObjRespondTo(railtie, "paths") &&
            (path = await railtie.paths!().get("db/migrate")!.first()) != null
          ) {
            railties[railtie.railtieName] = path;
          }

          if (!isBlank(ENV["MIGRATIONS_PATH"])) {
            railties[railtie.railtieName] = File.join(railtie.root()!, ENV["MIGRATIONS_PATH"]!);
          }
        }

        const onSkip = (name: string, migration: MigrationProxy): void => {
          STDOUT.puts(
            `NOTE: Migration ${migration.basename()} from ${name} has been skipped. Migration with the same name already exists.`,
          );
        };

        const onCopy = (name: string, migration: MigrationProxy): void => {
          STDOUT.puts(`Copied migration ${migration.basename()} from ${name}`);
        };

        let destination: string | string[] | undefined;
        if (isPresent(ENV["DATABASE"]) && ENV["DATABASE"] !== "primary") {
          const config = Base.configurations().configsFor({ name: ENV["DATABASE"]! });
          if (isBlank(config)) throw new RuntimeError("Invalid DATABASE provided");
          destination = config!.migrationsPaths;
          if (isBlank(destination)) {
            throw new RuntimeError(`${ENV["DATABASE"]} does not have a custom migration path`);
          }
        } else {
          destination = DatabaseTasks.migrationsPaths[0];
        }

        await Migration.copy(destination as string, railties, { onSkip, onCopy });
      }),
    );
  });
});
