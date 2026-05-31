import { Base, DatabaseConfigurations, DatabaseTasks } from "@blazetrails/activerecord";
import { loadDatabaseConfig, tryLoadModels } from "./db-helpers.js";

export interface StartOptions {
  /** Override of repl.start — injected by tests to avoid opening a real REPL. */
  startRepl?: (opts: { prompt: string; useGlobal: boolean }) => {
    context: Record<string, unknown>;
    on(event: string, cb: () => void): void;
  };
}

export async function arConsole(
  cwd: string,
  args: string[],
  opts: StartOptions = {},
): Promise<number> {
  const envIdx = args.indexOf("--env");
  if (envIdx >= 0 && args[envIdx + 1] && !args[envIdx + 1].startsWith("-")) {
    process.env["TRAILS_ENV"] = args[envIdx + 1];
  }

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

  const models = await tryLoadModels(cwd).catch((err: unknown) => {
    console.error(`ar: failed to load app/models/index.ts — ${String(err)}`);
    return null;
  });
  if (!models) return 1;

  type StartFn = NonNullable<StartOptions["startRepl"]>;
  const startFn: StartFn = opts.startRepl ?? ((await import("repl")).start as unknown as StartFn);
  const replContext = startFn({ prompt: "trails> ", useGlobal: false });

  Object.assign(replContext.context, { Base, ...models });

  return new Promise<number>((res) => {
    replContext.on("exit", () => {
      try {
        Base.removeConnection();
      } catch {
        // pool may already be gone
      }
      res(0);
    });
  });
}
