import { resolve, join } from "path";
import { Base, DatabaseConfigurations, DatabaseTasks } from "@blazetrails/activerecord";
import { loadDatabaseConfig, tryLoadModels } from "./db-helpers.js";

export async function arRunner(cwd: string, args: string[]): Promise<number> {
  const envIdx = args.indexOf("--env");
  if (envIdx >= 0 && args[envIdx + 1] && !args[envIdx + 1].startsWith("-")) {
    process.env["TRAILS_ENV"] = args[envIdx + 1];
  }

  let scriptPath: string | undefined;
  let scriptIdx = -1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env") {
      i++;
      continue;
    }
    if (!args[i]!.startsWith("-")) {
      scriptPath = args[i];
      scriptIdx = i;
      break;
    }
  }
  if (!scriptPath) {
    console.error("ar: runner requires a script path.");
    return 1;
  }
  const scriptArgv = args
    .slice(scriptIdx + 1)
    .filter((a, i, arr) => a !== "--env" && arr[i - 1] !== "--env");

  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const configs = DatabaseTasks.configsFor(DatabaseConfigurations.currentEnv());
  if (configs.length > 0) {
    const dbConfig = configs.find((c) => c.name === "primary") ?? configs[0]!;
    try {
      await Base.establishConnection(dbConfig.configurationHash as { [key: string]: unknown });
    } catch (err) {
      console.error(`ar: failed to establish connection — ${String(err)}`);
      return 1;
    }
  }

  (globalThis as unknown as Record<string, unknown>)["__ARGV__"] = scriptArgv;
  const abs = resolve(join(cwd, scriptPath));
  const { pathToFileURL } = await import("node:url");
  try {
    await tryLoadModels(cwd);
    await import(pathToFileURL(abs).href);
  } catch (err) {
    console.error(`ar: runner failed — ${String(err)}`);
    return 1;
  } finally {
    try {
      Base.removeConnection();
    } catch {
      // pool may already be gone
    }
    delete (globalThis as unknown as Record<string, unknown>)["__ARGV__"];
  }

  return 0;
}
