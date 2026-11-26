import { DSL, Rake } from "@blazetrails/rake";
import { Dir, File, Pathname, TopLevel, block, rbFLoad } from "@blazetrails/ruby-compat";
import { ENGINE_ROOT, setEngineRoot } from "../app-path.js";
import { Updater } from "../engine/updater.js";
import { Engine } from "../engine.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    APP_RAKEFILE?: string;
  }
}

DSL.task(
  "load_app",
  block(async () => {
    await DSL.namespace("app", async () => {
      await rbFLoad(TopLevel.APP_RAKEFILE!);

      DSL.desc("Update some initially generated files");
      DSL.task({ update: ["update:bin"] });

      DSL.namespace("update", () => {
        DSL.task(
          "bin",
          block(() => Updater.run("createBinFiles")),
        );
      });
    });
    DSL.task({ environment: "app:environment" });

    if (ENGINE_ROOT == null) {
      setEngineRoot(await findEnginePath(new Pathname(TopLevel.APP_RAKEFILE!)));
    }
  }),
);

function appTask(name: string): void {
  DSL.task({ [name]: ["load_app", `app:db:${name}`] });
}

DSL.namespace("db", () => {
  appTask("reset");

  DSL.desc("Migrate the database (options: VERSION=x, VERBOSE=false).");
  appTask("migrate");
  appTask("migrate:up");
  appTask("migrate:down");
  appTask("migrate:redo");
  appTask("migrate:reset");

  DSL.desc("Display status of migrations");
  appTask("migrate:status");

  DSL.desc(
    "Create the database from config/database.yml for the current Trails.env (use db:create:all to create all databases in the config)",
  );
  appTask("create");
  appTask("create:all");

  DSL.desc("Drop the database for the current Trails.env (use db:drop:all to drop all databases)");
  appTask("drop");
  appTask("drop:all");

  DSL.desc("Load fixtures into the current environment's database.");
  appTask("fixtures:load");

  DSL.desc("Roll the schema back to the previous version (specify steps w/ STEP=n).");
  appTask("rollback");

  DSL.desc(
    "Create a database schema file (either db/schema.rb or db/structure.sql, depending on `config.active_record.schema_format`)",
  );
  appTask("schema:dump");

  DSL.desc("Load a schema.rb file into the database");
  appTask("schema:load");

  DSL.desc("Load the seed data from db/seeds.rb");
  appTask("seed");

  DSL.desc(
    "Create the database, load the schema, and initialize with the seed data (use db:reset to also drop the database first)",
  );
  appTask("setup");

  DSL.desc("Retrieve the current schema version number");
  appTask("version");

  appTask("test:prepare");
});

async function findEnginePath(path: Pathname): Promise<string> {
  if (path.isRoot()) return File.expandPath(Dir.pwd());

  if ((await Engine.find(path.toString())) != null) {
    return path.toString();
  } else {
    return findEnginePath(path.join(".."));
  }
}

await Rake.application!.invokeTask("load_app");
