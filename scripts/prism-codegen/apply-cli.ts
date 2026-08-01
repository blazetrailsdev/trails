import * as fs from "fs/promises";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { TOPLEVEL } from "./codegen.js";
import { TARGET_FILES, TRAILS_AR_SRC, portTreeFiles, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import { indexPortTree } from "./score.js";
import { planApply } from "./apply.js";

const USAGE =
  "usage: pnpm codegen:apply <rails-file> <method> [--dry-run]\n\n" +
  "  <rails-file>  a TARGET_FILES entry, e.g. active_record/persistence.rb\n" +
  "                (the active_record/ prefix is optional)\n" +
  "  <method>      the camelCase generated def name, as shown by codegen:score\n\n" +
  "Writes a DRAFT body, marker-commented, at the Rails-layout position in the\n" +
  "twin port file. Draft only: never run from an autofix or commit hook, and\n" +
  "never commit a body that still carries the marker.";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  if (args.length !== 2) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const [rawFile, methodName] = args;
  const wanted = rawFile.replace(/^active_record\//, "");
  const target = TARGET_FILES.find((f) => f.ruby.replace(/^active_record\//, "") === wanted);
  if (!target) {
    console.error(
      `unknown Rails file: ${rawFile}\n\nknown files:\n` +
        TARGET_FILES.map((f) => `  ${f.ruby}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  if (methodName === TOPLEVEL) {
    console.error("the file's toplevel body is not a scaffoldable def.");
    process.exitCode = 1;
    return;
  }

  const tsFile = rubyFileToTs(wanted);
  const portPath = path.join(TRAILS_AR_SRC, tsFile);
  let portSource;
  try {
    portSource = await fs.readFile(portPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.error(`no port file at ${portPath} — create the twin file first.`);
    process.exitCode = 1;
    return;
  }

  const { code, perDef } = await generateFromSource(
    await fs.readFile(rubyAbsPath(target), "utf8"),
    asyncMethodsForRailsFile(target.ruby),
  );
  const plan = planApply({
    generatedCode: code,
    portSource,
    portFile: tsFile,
    methodName,
    globalIndex: indexPortTree(portTreeFiles()),
    passthrough: perDef.get(methodName)?.passthrough,
  });
  if (plan.status === "refused") {
    console.error(`refused: ${plan.reason}`);
    process.exitCode = 1;
    return;
  }

  const where = plan.insertedAfter
    ? `after ${plan.insertedAfter}`
    : plan.insertedBefore
      ? `before ${plan.insertedBefore}`
      : "at end of file";
  if (dryRun) {
    console.log(`would insert ${methodName} ${where} in ${portPath}`);
    return;
  }
  await fs.writeFile(portPath, plan.source, "utf8");
  console.log(
    `inserted DRAFT ${methodName} ${where} in ${portPath}.\n` +
      `It is unreviewed machine output: finish it, run the tests, and delete the\n` +
      `marker comment before committing. Nothing was staged or committed.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
