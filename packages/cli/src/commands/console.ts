import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import * as vm from "node:vm";

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
      const { Base } = await import("@blazetrails/activerecord");
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

    console.log("Loading trails console...");

    // Custom eval that supports top-level await.
    // Expressions (e.g., `await User.all()`) are wrapped as return values.
    // Note: `const`/`let` declarations inside the async IIFE don't persist
    // across inputs — use plain assignment (`x = await ...`) for that.
    const asyncEval = (code: string, context: any, _filename: string, callback: any) => {
      // Strip trailing whitespace/semicolons so `return (expr)` wrapper is valid
      const trimmed = code.replace(/[\s;]+$/, "");
      (async () => {
        try {
          const result = await vm.runInNewContext(
            `(async () => { return (\n${trimmed}\n); })()`,
            context,
            { breakOnSigint: true },
          );
          callback(null, result);
        } catch (exprErr: any) {
          // Only fall back to statement mode for syntax errors (expression wrapper failed to parse).
          // Runtime errors should not trigger a re-execution.
          if (!(exprErr instanceof SyntaxError)) {
            callback(exprErr);
            return;
          }
          try {
            const result = await vm.runInNewContext(`(async () => {\n${code}\n})()`, context, {
              breakOnSigint: true,
            });
            callback(null, result);
          } catch (err: any) {
            if (isRecoverable(err)) {
              callback(new (repl as any).Recoverable(err));
            } else {
              callback(err);
            }
          }
        }
      })();
    };

    const r = repl.start({
      prompt: "trails> ",
      eval: asyncEval,
    });

    // Copy globals into the REPL context
    r.context.console = console;
    r.context.process = process;
    r.context.require = createRequire(path.join(process.cwd(), "package.json"));

    r.on("exit", async () => {
      if (dbAdapter && typeof dbAdapter.close === "function") {
        await dbAdapter.close();
      }
    });

    // Make activerecord Base available
    try {
      const ar = await import("@blazetrails/activerecord");
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

    console.log("Supports top-level await (e.g., await User.all())");
    console.log('Type ".exit" or Ctrl+D to quit.');
    console.log("");
  });

  return cmd;
}

function isRecoverable(err: Error): boolean {
  if (!(err instanceof SyntaxError)) return false;
  return /\b(Unexpected end of input|Unexpected end of script|Unterminated)\b/i.test(err.message);
}
