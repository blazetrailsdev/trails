import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

export function consoleCommand(): Command {
  const cmd = new Command("console");
  cmd.alias("c");
  cmd.description("Start an interactive console with the application loaded").action(async () => {
    const repl = await import("node:repl");

    // Connect to database
    let dbAdapter: any;
    try {
      const { loadDatabaseConfig, connectAdapter } = await import("../database.js");
      const config = await loadDatabaseConfig();
      dbAdapter = await connectAdapter(config);
      const { Base } = await import("@rails-ts/activerecord");
      Base.adapter = dbAdapter;
      console.log(
        `Connected to ${config.adapter ?? "sqlite3"} (${config.database ?? "in-memory"})`,
      );
    } catch (error) {
      console.log("Could not connect to database.");
      if (error instanceof Error) {
        console.log(error.message);
      }
    }

    console.log("Loading rails-ts console...");

    const r = repl.start({
      prompt: "rails-ts> ",
      useGlobal: true,
    });

    r.on("exit", async () => {
      if (dbAdapter && typeof dbAdapter.close === "function") {
        await dbAdapter.close();
      }
    });

    // Make activerecord Base available
    try {
      const ar = await import("@rails-ts/activerecord");
      r.context.Base = ar.Base;
      r.context.Migration = ar.Migration;
    } catch {
      // activerecord not available
    }

    // Load models from the current project
    const modelsDir = path.join(process.cwd(), "src", "app", "models");
    let loadedCount = 0;
    if (fs.existsSync(modelsDir)) {
      const files = fs
        .readdirSync(modelsDir)
        .filter((f: string) => f.endsWith(".ts") || f.endsWith(".js"));
      for (const file of files) {
        try {
          const mod = await import(pathToFileURL(path.join(modelsDir, file)).href);
          for (const [name, value] of Object.entries(mod)) {
            if (typeof value === "function") {
              (r.context as any)[name] = value;
            }
          }
          loadedCount++;
        } catch {
          // Skip files that fail to import
        }
      }
      if (loadedCount > 0) {
        console.log(`Loaded ${loadedCount} model(s) from src/app/models/`);
      }
    }

    console.log('Type ".exit" or Ctrl+D to quit.');
    console.log("");
  });

  return cmd;
}
