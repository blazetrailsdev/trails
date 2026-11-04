import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppGenerator } from "@blazetrails/trailties/generators";
import { InstallGenerator } from "./install-generator.js";

const packageDir = path.resolve(import.meta.dirname, "../../../..");

function run(app: string, args: string[]) {
  const child = spawn(globalThis.process.execPath, args, {
    cwd: app,
    env: { PATH: "", NODE_ENV: "test", TRAILS_ENV: "test" },
  });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  return { child, exited, output: () => output };
}

describe("SolidQueue::InstallGeneratorTest", () => {
  let root: string;
  let app: string;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(packageDir, "../trailties/tmp-solid-queue-"));
    await new AppGenerator(
      ["my-app"],
      { database: "sqlite", skipSolid: true },
      { destinationRoot: root },
    ).invokeAll();
    app = path.join(root, "my-app");
    await InstallGenerator.start([], { destinationRoot: app });
  }, 60_000);

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("copies the install templates", () => {
    for (const file of [
      "config/queue.yml",
      "config/recurring.yml",
      "db/queue_schema.ts",
      "bin/jobs",
    ]) {
      expect(fs.existsSync(path.join(app, file))).toBe(true);
    }
    expect(fs.statSync(path.join(app, "bin/jobs")).mode & 0o111).not.toBe(0);
  });

  it("configures the adapter and database in production", () => {
    const production = fs.readFileSync(path.join(app, "config/environments/production.ts"), "utf8");
    expect(production).toContain('  this.config.activeJob.queueAdapter = "solid_queue";\n');
    expect(production).toContain("this.config.solidQueue.connectsTo = {");
    expect(production).not.toContain("resque");
  });

  it("bin/jobs loads job classes after the boot and forwards its arguments", async () => {
    fs.mkdirSync(path.join(app, "node_modules/@blazetrails"), { recursive: true });
    fs.symlinkSync(packageDir, path.join(app, "node_modules/@blazetrails/solid-queue"));
    fs.writeFileSync(
      path.join(app, "config/database.ts"),
      `const queue = { adapter: "sqlite3", database: "storage/queue.sqlite3", timeout: 5000 };
export default { test: { primary: queue, queue } };
`,
    );
    fs.appendFileSync(
      path.join(app, "config/application.ts"),
      `import { Engine } from "@blazetrails/solid-queue/engine";
Engine.config.solidQueue.connectsTo = { database: { writing: ":queue" } };
`,
    );
    fs.writeFileSync(
      path.join(app, "app/jobs/limited-job.ts"),
      `import { Base } from "@blazetrails/activejob";
export class LimitedJob extends Base {
  static {
    this.limitsConcurrency({ key: "limited" });
  }
}
`,
    );
    fs.writeFileSync(
      path.join(app, "load-schema.ts"),
      `import "./config/environment.ts";
await import("./db/queue_schema.ts");
`,
    );
    fs.writeFileSync(
      path.join(app, "queues.ts"),
      `import "./config/environment.ts";
const { Process } = await import("@blazetrails/solid-queue");
const workers = await Process.where({ kind: "Worker" }).toArray();
console.log(workers.map((worker) => worker.metadata.get("queues")).join());
await new Promise((resolve) => setTimeout(resolve, 0));
process.exit(0);
`,
    );
    fs.writeFileSync(
      path.join(app, "config/forwarded.yml"),
      `test:
  workers:
    - queues: forwarded
`,
    );
    const schema = run(app, ["load-schema.ts"]);
    expect(await schema.exited).toBe(0);

    const jobs = run(app, ["bin/jobs", "-c", "config/forwarded.yml"]);
    let queues = "";
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && jobs.child.exitCode == null && !queues) {
      const query = run(app, ["queues.ts"]);
      await query.exited;
      queues = query.output().trim();
    }
    const exitCode = jobs.child.exitCode;
    jobs.child.kill("SIGTERM");
    await jobs.exited;

    expect(jobs.output()).not.toContain("limitsConcurrency is not a function");
    expect(exitCode).toBeNull();
    expect(queues).toBe("forwarded");
  }, 60_000);
});
