#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLineMappings } from "@blazetrails/trails-tsc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const expected = JSON.parse(fs.readFileSync(path.join(root, "hero/errors.json"), "utf8"));
const controller = "app/controllers/posts-controller.ts";
const view = "app/views/posts/show.html.tse";
const generated = "gen/views/posts/show.html.tse.ts";

const map = (scratch) =>
  decodeLineMappings(
    JSON.parse(fs.readFileSync(path.join(scratch, `${generated}.map`), "utf8")).mappings,
  );

function compile(name, edits) {
  const scratch = path.join(root, `.hero-check-${name}`);
  fs.rmSync(scratch, { recursive: true, force: true });
  let out = "";
  let lines;
  try {
    fs.mkdirSync(scratch);
    fs.cpSync(path.join(root, "app"), path.join(scratch, "app"), { recursive: true });
    for (const [from, to] of edits) fs.copyFileSync(path.join(root, from), path.join(scratch, to));
    fs.writeFileSync(
      path.join(scratch, "tsconfig.json"),
      JSON.stringify({ extends: "../tsconfig.json", include: ["app", "gen/views"] }),
    );
    execFileSync(
      process.execPath,
      [
        path.join(repo, "packages/trails-tsc/bin/trails-tsc-views.js"),
        "build",
        "--views",
        "app/views",
        "--out",
        "gen",
      ],
      { cwd: scratch, stdio: "ignore" },
    );
    try {
      execFileSync(
        process.execPath,
        [path.join(repo, "node_modules/typescript-5/bin/tsc"), "--noEmit", "-p", "."],
        {
          cwd: scratch,
          encoding: "utf8",
        },
      );
    } catch (err) {
      out = String(err.stdout);
      if (err.stderr) process.stderr.write(String(err.stderr));
    }
    lines = map(scratch);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const reported = [];
  for (const line of out.split("\n")) {
    const m = /^(.+?)\((\d+),(\d+)\): (.*)$/.exec(line);
    if (!m) continue;
    let [, file, ln, col, msg] = m;
    if (file === generated) {
      const genLine = Number(ln) - 1;
      const genCol = Number(col) - 1;
      const seg = lines.filter((s) => s.genLine === genLine && s.genCol <= genCol).at(-1);
      if (!seg) continue;
      file = view;
      ln = String(seg.srcLine + 1);
      col = String(seg.srcCol + (genCol - seg.genCol) + 1);
    }
    reported.push(`${file}(${ln},${col}): ${msg}`);
  }
  return reported;
}

const runs = {
  [controller]: compile("controller", [["hero/posts-controller.ts", controller]]),
  [view]: compile("view", [["hero/show.html.tse", view]]),
};

let failed = false;
for (const [file, error] of Object.entries(expected)) {
  if (!runs[file].includes(error)) {
    console.error(
      `check-hero: ${file} did not report\n  ${error}\ngot:\n  ${runs[file].join("\n  ")}`,
    );
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("check-hero: both hero errors match the compiler");
