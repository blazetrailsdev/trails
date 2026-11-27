// Runs one leg of a sharded AR adapter lane from a work queue every leg of
// the lane shares, so a fast runner takes more files than a slow one
// (hosted runners vary about ±25% between jobs, trails#10272).
//
//   node scripts/ci/ar-shard-queue.mts <shard>/<total> <vitest run args>...
//
// Every leg globs the same files, weighs them by ar-shard-durations.json
// (VITEST_SHARD_DURATIONS) and cuts the same batches, longest first and each
// a fraction of what is left (guided self-scheduling), so the last batches
// are small. A leg claims batch i by creating the ref
// refs/ci-queue/<run>-<attempt>/<job>/<i>: ref creation is atomic, so exactly
// one leg gets each batch, and the `ci` job deletes the run's refs. One
// vitest instance runs every batch a leg claims, so globalSetup and the
// transform cache are paid once. Without a token that may write refs (a fork
// PR), batch i goes to leg (i mod total) + 1.
import { createVitest, parseCLI, type TestSpecification } from "vitest/node";
import { loadDurations, specKey, weigher } from "./duration-sequencer.ts";

const [shardArg, ...vitestArgs] = process.argv.slice(2);
const [index, count] = (shardArg ?? "").split("/").map(Number);
if (!(index >= 1 && count >= index)) throw new Error("usage: ar-shard-queue.mts <shard>/<total> …");

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_JOB } =
  process.env;
const queue = `refs/ci-queue/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/${GITHUB_JOB}`;
let shared = Boolean(GITHUB_TOKEN && GITHUB_REPOSITORY && GITHUB_SHA && GITHUB_RUN_ID);

async function claim(i: number): Promise<boolean> {
  if (!shared) return i % count === index - 1;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/git/refs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: `${queue}/${i}`, sha: GITHUB_SHA }),
    }).catch((error: unknown) => error as Error);
    const status = response instanceof Response ? response.status : 0;
    if (status === 201) return true;
    if (status === 422) return false;
    if ((status === 403 || status === 404) && i === 0) {
      console.log(`::warning title=AR shard queue::ref claims refused (${status}); static split`);
      shared = false;
      return claim(i);
    }
    if (attempt === 5) throw new Error(`claiming ${queue}/${i} failed with ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
}

function batches(specs: TestSpecification[], weigh: (spec: TestSpecification) => number) {
  const weighed = specs
    .map((spec) => ({ spec, weight: weigh(spec), key: `${spec.project.name} ${spec.moduleId}` }))
    .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const total = weighed.reduce((sum, { weight }) => sum + weight, 0);
  const floor = total / (count * 25);
  const out: TestSpecification[][] = [];
  let remaining = total;
  let batch: TestSpecification[] = [];
  let load = 0;
  for (const { spec, weight } of weighed) {
    batch.push(spec);
    load += weight;
    if (load >= Math.max(remaining / (2 * count), floor)) {
      out.push(batch);
      remaining -= load;
      batch = [];
      load = 0;
    }
  }
  if (batch.length) out.push(batch);
  return out;
}

const { filter, options } = parseCLI(["vitest", "run", ...vitestArgs]);
// What `startVitest` sets before it creates the instance (prepareVitest).
process.env.TEST = "true";
process.env.VITEST = "true";
process.env.NODE_ENV ??= "test";
const vitest = await createVitest("test", { ...options, run: true, watch: false });
await (vitest as unknown as { report(name: "onInit", ctx: unknown): Promise<void> }).report(
  "onInit",
  vitest,
);
const specs = await vitest.globTestSpecifications(filter);
const table = (await loadDurations()) ?? {};
const queued = batches(specs, weigher(vitest.config.root, table));
console.log(`${specs.length} files in ${queued.length} batches; leg ${index}/${count}`);
let ran = 0;
for (let i = 0; i < queued.length; i++) {
  if (!(await claim(i))) continue;
  ran += queued[i].length;
  console.log(`::group::batch ${i + 1}/${queued.length} (${queued[i].length} files)`);
  for (const spec of queued[i]) console.log(`  ${specKey(vitest.config.root, spec)}`);
  console.log("::endgroup::");
  await vitest.runTestSpecifications(queued[i], false);
}
console.log(`leg ${index}/${count} ran ${ran} of ${specs.length} files`);
await vitest.close();
process.exit(process.exitCode ?? 0);
