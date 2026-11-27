/**
 * Runs one leg of a sharded AR adapter lane from a work queue every leg of
 * the lane shares, so a fast runner takes more files than a slow one
 * (hosted runners vary about ±25% between jobs, trails#10272).
 *
 *   node scripts/ci/ar-shard-queue.mts <shard>/<total> <vitest run args>...
 *
 * Every leg globs the same files, weighs them by ar-shard-durations.json
 * (VITEST_SHARD_DURATIONS) and cuts the same batches, longest first and each
 * a fraction of what is left (guided self-scheduling), so the last batches
 * are small. A leg claims batch i by creating the ref
 * refs/ci-queue/<run>/<job>/claim/<i> (ref creation is atomic, so exactly one
 * leg gets each batch) and records itself in .../owner/<leg>/<i>. A re-run
 * leg (attempt > 1) runs the batches it owned, plus any nobody claimed. One
 * vitest instance runs every batch a leg claims, so globalSetup and the
 * transform cache are paid once. Without a token that may write refs (a fork
 * PR), batch i goes to leg (i mod total) + 1. The `ci` job deletes a run's
 * refs once it passes, and every run's refs once they are 30 days old.
 */
import { createVitest, parseCLI, type TestSpecification } from "vitest/node";
import { loadDurations, specKey, weigher } from "./duration-sequencer.ts";

const [shardArg, ...vitestArgs] = process.argv.slice(2);
const [index, count] = (shardArg ?? "").split("/").map(Number);
if (!(index >= 1 && count >= index)) throw new Error("usage: ar-shard-queue.mts <shard>/<total> …");

const {
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
  GITHUB_SHA,
  GITHUB_RUN_ID,
  GITHUB_RUN_ATTEMPT,
  GITHUB_JOB,
} = process.env;
const queue = `ci-queue/${GITHUB_RUN_ID}/${GITHUB_JOB}`;
const api = `https://api.github.com/repos/${GITHUB_REPOSITORY}/git`;
let shared = Boolean(GITHUB_TOKEN && GITHUB_REPOSITORY && GITHUB_SHA && GITHUB_RUN_ID);

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${api}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((error: unknown) => error as Error);
    const status = response instanceof Response ? response.status : 0;
    const limited =
      response instanceof Response &&
      (status === 429 || (status === 403 && response.headers.get("x-ratelimit-remaining") === "0"));
    if (response instanceof Response && !limited && status < 500) return response;
    if (attempt === 5) throw new Error(`${method} ${path} failed with ${status}`);
    const retryAfter = response instanceof Response ? response.headers.get("retry-after") : null;
    const reset = response instanceof Response ? response.headers.get("x-ratelimit-reset") : null;
    const wait = retryAfter
      ? Number(retryAfter) * 1000
      : reset && limited
        ? Math.max(0, Number(reset) * 1000 - Date.now())
        : 2000 * attempt;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function create(ref: string): Promise<boolean> {
  const response = await request("POST", "refs", { ref: `refs/${ref}`, sha: GITHUB_SHA });
  if (response.status === 201) return true;
  if (response.status === 422) return false;
  if ((response.status === 403 || response.status === 404) && !claimedAny) {
    console.log(`::warning title=AR shard queue::ref writes refused; static split`);
    shared = false;
    return false;
  }
  throw new Error(`creating ${ref} failed with ${response.status}`);
}

let claimedAny = false;

async function claim(i: number): Promise<boolean> {
  if (!shared) return i % count === index - 1;
  if (!(await create(`${queue}/claim/${i}`))) return shared ? false : claim(i);
  claimedAny = true;
  await create(`${queue}/owner/${index}/${i}`);
  return true;
}

async function owned(): Promise<Set<number>> {
  const response = await request("GET", `matching-refs/${queue}/owner/${index}/`);
  const refs = (await response.json()) as { ref: string }[];
  return new Set(refs.map(({ ref }) => Number(ref.slice(ref.lastIndexOf("/") + 1))));
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
let failed = false;
const rerun = shared && Number(GITHUB_RUN_ATTEMPT ?? 1) > 1 ? await owned() : null;
for (let i = 0; i < queued.length; i++) {
  if (rerun ? !rerun.has(i) && !(await claim(i)) : !(await claim(i))) continue;
  ran += queued[i].length;
  console.log(`::group::batch ${i + 1}/${queued.length} (${queued[i].length} files)`);
  for (const spec of queued[i]) console.log(`  ${specKey(vitest.config.root, spec)}`);
  console.log("::endgroup::");
  const { testModules, unhandledErrors } = await vitest.runTestSpecifications(queued[i], false);
  if (unhandledErrors.length || testModules.some((module) => !module.ok())) failed = true;
}
console.log(`leg ${index}/${count} ran ${ran} of ${specs.length} files`);
await vitest.close();
process.exit(failed ? 1 : (process.exitCode ?? 0));
