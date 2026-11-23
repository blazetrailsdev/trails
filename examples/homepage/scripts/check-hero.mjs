#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const expected = JSON.parse(fs.readFileSync(path.join(root, "hero/errors.json"), "utf8"));
const controller = "app/controllers/posts-controller.ts";
const view = "app/views/post-mailer/published.html.tse";

function compile(name, edits) {
  const scratch = path.join(root, `.hero-check-${name}`);
  fs.rmSync(scratch, { recursive: true, force: true });
  let out = "";
  try {
    fs.mkdirSync(scratch);
    fs.cpSync(path.join(root, "app"), path.join(scratch, "app"), { recursive: true });
    for (const [from, to] of edits) fs.copyFileSync(path.join(root, from), path.join(scratch, to));
    fs.writeFileSync(
      path.join(scratch, "tsconfig.json"),
      JSON.stringify({ extends: "../tsconfig.json", include: ["app", "gen"] }),
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
        [path.join(repo, "packages/activerecord-cli/bin/trails-tsc.js"), "--noEmit", "-p", "."],
        {
          cwd: scratch,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (err) {
      out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const errors = [];
  for (const line of out.split("\n")) {
    if (/^.+?\(\d+,\d+\): /.test(line)) errors.push(line);
    else if (/^\s+\S/.test(line) && errors.length > 0 && !/^\s+in </.test(line)) {
      errors[errors.length - 1] += `\n${line}`;
    }
  }
  return errors;
}

const unedited = compile("unedited", []);
if (unedited.length > 0) {
  console.error(`check-hero: the unedited app does not typecheck:\n  ${unedited.join("\n  ")}`);
  process.exit(1);
}

const runs = {
  [controller]: compile("controller", [["hero/posts-controller.ts", controller]]),
  [view]: compile("view", [["hero/published.html.tse", view]]),
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
