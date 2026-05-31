import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";

/**
 * Resolves the absolute path of a bin entry from a package using Node's module
 * resolution, then spawns it synchronously, forwarding all extra args and the
 * calling process's stdio. Returns the child's exit code (defaults to 1 on
 * signal termination).
 */
export function delegateBin(pkg: string, binName: string, args: string[]): number {
  const req = createRequire(import.meta.url);
  const pkgJson = req(`${pkg}/package.json`) as { bin?: Record<string, string> };
  const rel = pkgJson.bin?.[binName];
  if (!rel) {
    process.stderr.write(`ar: could not find bin "${binName}" in ${pkg}\n`);
    return 1;
  }
  const pkgRoot = dirname(req.resolve(`${pkg}/package.json`));
  const binPath = join(pkgRoot, rel);
  const result = spawnSync(process.execPath, [binPath, ...args], {
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`ar: failed to spawn ${binName}: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}
