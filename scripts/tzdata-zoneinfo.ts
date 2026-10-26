/**
 * A zoneinfo directory compiled from the IANA release Node's ICU carries
 * (`process.versions.tz`), for the Ruby tzinfo the tzdata generators run.
 *
 * The port reads offsets from that ICU release at run time, so a table built
 * from the host's `/usr/share/zoneinfo` mixes two releases, and two ways of
 * building links: the host may keep `CET` / `EST` as fixed zones where the
 * release's `backward` file links them to `Europe/Brussels` / `America/Panama`.
 * The release is fetched once and compiled from its rearguard form, which ICU
 * builds from too (no negative DST, so `Europe/Dublin`'s summer is the DST
 * period), with `zic`'s default (slim) output, into
 * `node_modules/.cache/tzdata/zoneinfo-rearguard-<release>/`.
 */
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The IANA release Node's ICU carries. */
export function tzdataVersion(): string {
  const version = process.versions.tz;
  if (!version) throw new Error("this Node carries no ICU tz version");
  return version;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** The compiled zoneinfo directory for `tzdataVersion()`, building it on first use. */
export async function zoneinfo(): Promise<string> {
  const version = tzdataVersion();
  const dir = path.join(
    REPO_ROOT,
    "node_modules",
    ".cache",
    "tzdata",
    `zoneinfo-rearguard-${version}`,
  );
  if (await exists(dir)) return dir;
  await mkdir(path.dirname(dir), { recursive: true });
  const src = await mkdtemp(path.join(os.tmpdir(), "tzdata-src-"));
  const build = await mkdtemp(`${dir}.partial-`);
  try {
    const tarball = path.join(src, "tzdata.tar.gz");
    const url = `https://data.iana.org/time-zones/releases/tzdata${version}.tar.gz`;
    await execFileAsync("curl", ["-fsSL", "-o", tarball, url]);
    await execFileAsync("tar", ["xzf", tarball, "-C", src]);
    await execFileAsync("make", ["rearguard.zi"], { cwd: src });
    await execFileAsync("zic", ["-d", build, "rearguard.zi"], { cwd: src });
    for (const tab of ["iso3166.tab", "zone.tab", "zone1970.tab"]) {
      await copyFile(path.join(src, tab), path.join(build, tab));
    }
    try {
      await rename(build, dir);
    } catch (e) {
      if (!(await exists(dir))) throw e;
    }
  } finally {
    await rm(src, { recursive: true, force: true });
    await rm(build, { recursive: true, force: true });
  }
  return dir;
}

/** The Ruby preamble that points tzinfo at the directory in `TZDATA_ZONEINFO`. */
export const RUBY_ZONEINFO_PREAMBLE = `
require "tzinfo"
TZInfo::DataSource.set(:zoneinfo, ENV.fetch("TZDATA_ZONEINFO"))
`;

/** `process.env` plus `TZDATA_ZONEINFO`, and `TZDIR` for MRI's own `localtime`. */
export async function zoneinfoEnv(): Promise<NodeJS.ProcessEnv> {
  const dir = await zoneinfo();
  return { ...process.env, TZDATA_ZONEINFO: dir, TZDIR: dir };
}
