import { Command } from "commander";

export function consoleCommand(): Command {
  const cmd = new Command("console");
  cmd.alias("c");
  cmd.description("Start an interactive console with the application loaded").action(async () => {
    const repl = await import("node:repl");
    console.log("Loading rails-ts console...");
    console.log('Type ".exit" or Ctrl+D to quit.');
    console.log("");

    const r = repl.start({
      prompt: "rails-ts> ",
      useGlobal: true,
    });

    // Try to load models from the current project
    try {
      const modelsDir = (await import("node:path")).join(process.cwd(), "src", "app", "models");
      const fs = await import("node:fs");
      if (fs.existsSync(modelsDir)) {
        const files = fs.readdirSync(modelsDir).filter((f: string) => f.endsWith(".ts"));
        for (const file of files) {
          try {
            const mod = await import((await import("node:path")).join(modelsDir, file));
            for (const [name, value] of Object.entries(mod)) {
              (r.context as any)[name] = value;
            }
          } catch {
            // Skip files that fail to import
          }
        }
      }
    } catch {
      // No models directory
    }
  });

  return cmd;
}
