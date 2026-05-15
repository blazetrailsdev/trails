// Wave 7: generate scripts/parity/schema/ruby/Gemfile from vendor/sources.ts
// so the activerecord pin can't drift from the rails ref pinned in the
// upstream-source registry.
//
// The Gemfile stays committed (so contributors can `bundle exec --gemfile`
// without an extra build step). This script rewrites it only when the
// generated content differs — same idempotent pattern as vendor/fetch.ts's
// writeLockfile. Called from scripts/parity/run.ts before any rails-side
// work; CI will see a non-empty diff if the Gemfile was out of sync at
// merge time.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCES } from "../../../../vendor/sources.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEMFILE_PATH = join(HERE, "Gemfile");

function railsVersion(): string {
  const rails = SOURCES.find((s) => s.name === "rails");
  if (!rails) throw new Error("vendor/sources.ts: no rails source");
  // Refs are tags like "v8.0.2" — strip the leading "v" for the gem version.
  const ref = rails.origin.ref;
  if (!/^v\d/.test(ref)) {
    throw new Error(`vendor/sources.ts: rails origin.ref "${ref}" doesn't look like a vN.N.N tag`);
  }
  return ref.slice(1);
}

export function buildGemfileContent(): string {
  const arVersion = railsVersion();
  return [
    "# frozen_string_literal: true",
    "#",
    "# GENERATED from vendor/sources.ts by scripts/parity/schema/ruby/build-gemfile.ts.",
    "# Do not edit by hand — change vendor/sources.ts and the parity-schema runner",
    "# regenerates this file on its next invocation.",
    "",
    'source "https://rubygems.org"',
    "",
    `gem "activerecord", "${arVersion}"     # tracks rails ref in vendor/sources.ts`,
    `gem "sqlite3", "~> 2.1"         # matches AR ${arVersion} declared dependency range`,
    'gem "minitest", "~> 5.25"       # canonicalize_test.rb',
    "",
  ].join("\n");
}

export function buildGemfile(): { changed: boolean; path: string } {
  const next = buildGemfileContent();
  if (existsSync(GEMFILE_PATH) && readFileSync(GEMFILE_PATH, "utf8") === next) {
    return { changed: false, path: GEMFILE_PATH };
  }
  writeFileSync(GEMFILE_PATH, next);
  return { changed: true, path: GEMFILE_PATH };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { changed, path } = buildGemfile();
  console.log(changed ? `wrote ${path}` : `${path} already up to date`);
}
