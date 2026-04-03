import { execSync } from "child_process";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Base, MigrationContext } from "@blazetrails/activerecord";
import { SQLite3Adapter } from "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";

const REPO = "blazetrailsdev/blazetrails";
const DB_PATH = join(homedir(), "github", "blazetrailsdev", "stats.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

function gh(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf-8", maxBuffer: 50_000_000 });
}

function ghJson<T>(args: string): T {
  return JSON.parse(gh(args)) as T;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

class PullRequest extends Base {
  static {
    this.tableName = "pull_requests";
    this.primaryKey = "number";
    this.attribute("number", "integer");
    this.attribute("title", "string");
    this.attribute("author", "string");
    this.attribute("branch", "string");
    this.attribute("base_branch", "string");
    this.attribute("body", "string");
    this.attribute("created_at", "string");
    this.attribute("merged_at", "string");
    this.attribute("closed_at", "string");
    this.attribute("merge_commit_sha", "string");
    this.attribute("additions", "integer");
    this.attribute("deletions", "integer");
    this.attribute("changed_files", "integer");
    this.attribute("labels", "string");
    this.attribute("review_count", "integer", { default: -1 });
    this.attribute("comment_count", "integer", { default: -1 });
    this.attribute("commit_count", "integer", { default: 0 });
    this.attribute("time_open_seconds", "integer");
    this.attribute("review_decision", "string");
  }
}

class PrFile extends Base {
  static {
    this.tableName = "pr_files";
    this.attribute("pr_number", "integer");
    this.attribute("filename", "string");
    this.attribute("status", "string");
    this.attribute("additions", "integer");
    this.attribute("deletions", "integer");
    this.attribute("changes", "integer");
    this.attribute("patch", "string");
  }
}

class PrCommit extends Base {
  static {
    this.tableName = "pr_commits";
    this.attribute("pr_number", "integer");
    this.attribute("sha", "string");
    this.attribute("message", "string");
    this.attribute("author", "string");
    this.attribute("authored_at", "string");
  }
}

class PrComment extends Base {
  static {
    this.tableName = "pr_comments";
    this.attribute("pr_number", "integer");
    this.attribute("author", "string");
    this.attribute("body", "string");
    this.attribute("created_at", "string");
    this.attribute("updated_at", "string");
    this.attribute("comment_type", "string");
    this.attribute("path", "string");
    this.attribute("diff_hunk", "string");
    this.attribute("in_reply_to_id", "integer");
  }
}

class PrReview extends Base {
  static {
    this.tableName = "pr_reviews";
    this.attribute("pr_number", "integer");
    this.attribute("author", "string");
    this.attribute("state", "string");
    this.attribute("body", "string");
    this.attribute("submitted_at", "string");
  }
}

class WorkflowRun extends Base {
  static {
    this.tableName = "workflow_runs";
    this.attribute("head_sha", "string");
    this.attribute("pr_number", "integer");
    this.attribute("event", "string");
    this.attribute("status", "string");
    this.attribute("conclusion", "string");
    this.attribute("created_at", "string");
    this.attribute("updated_at", "string");
    this.attribute("run_started_at", "string");
    this.attribute("duration_seconds", "integer");
    this.attribute("workflow_name", "string");
  }
}

class WorkflowJob extends Base {
  static {
    this.tableName = "workflow_jobs";
    this.attribute("run_id", "integer");
    this.attribute("name", "string");
    this.attribute("status", "string");
    this.attribute("conclusion", "string");
    this.attribute("started_at", "string");
    this.attribute("completed_at", "string");
    this.attribute("duration_seconds", "integer");
  }
}

class TestCompareStat extends Base {
  static {
    this.tableName = "test_compare_stats";
    this.attribute("merge_commit_sha", "string");
    this.attribute("pr_number", "integer");
    this.attribute("package", "string");
    this.attribute("matched", "integer");
    this.attribute("total", "integer");
    this.attribute("percent", "float");
    this.attribute("skipped", "integer", { default: 0 });
    this.attribute("files_mapped", "integer", { default: 0 });
    this.attribute("files_total", "integer", { default: 0 });
    this.attribute("misplaced", "integer", { default: 0 });
  }
}

class ApiCompareStat extends Base {
  static {
    this.tableName = "api_compare_stats";
    this.attribute("merge_commit_sha", "string");
    this.attribute("pr_number", "integer");
    this.attribute("package", "string");
    this.attribute("matched", "integer");
    this.attribute("total", "integer");
    this.attribute("percent", "float");
    this.attribute("misplaced", "integer", { default: 0 });
    this.attribute("missing", "integer", { default: 0 });
  }
}

class CompareLog extends Base {
  static {
    this.tableName = "compare_logs";
    this.attribute("merge_commit_sha", "string");
    this.attribute("pr_number", "integer");
    this.attribute("step_name", "string");
    this.attribute("log_output", "string");
  }
}

class RawJobLog extends Base {
  static {
    this.tableName = "raw_job_logs";
    this.attribute("job_id", "integer");
    this.attribute("merge_commit_sha", "string");
    this.attribute("pr_number", "integer");
    this.attribute("log_output", "text");
  }
}

class SyncLog extends Base {
  static {
    this.tableName = "sync_log";
    this.attribute("synced_at", "string");
    this.attribute("prs_synced", "integer", { default: 0 });
    this.attribute("runs_synced", "integer", { default: 0 });
    this.attribute("logs_parsed", "integer", { default: 0 });
  }
}

// ---------------------------------------------------------------------------
// Schema setup via MigrationContext
// ---------------------------------------------------------------------------

async function tableExists(adapter: SQLite3Adapter, name: string): Promise<boolean> {
  const rows = await adapter.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [name],
  );
  return rows.length > 0;
}

async function migrateDb(adapter: SQLite3Adapter) {
  const ctx = new MigrationContext(adapter);

  const hasExistingSchema = await tableExists(adapter, "sync_log");

  if (hasExistingSchema) {
    if (!(await tableExists(adapter, "compare_logs"))) {
      await ctx.createTable("compare_logs", {}, (t) => {
        t.string("merge_commit_sha");
        t.integer("pr_number");
        t.string("step_name");
        t.text("log_output");
        t.index(["merge_commit_sha", "step_name"], { unique: true });
      });
    }
    if (!(await tableExists(adapter, "raw_job_logs"))) {
      await ctx.createTable("raw_job_logs", {}, (t) => {
        t.integer("job_id");
        t.string("merge_commit_sha");
        t.integer("pr_number");
        t.text("log_output");
        t.index(["merge_commit_sha"], { unique: true });
      });
    }
    return;
  }

  await adapter.beginTransaction();
  try {
    await ctx.createTable("pull_requests", { id: false }, (t) => {
      t.integer("number", { primaryKey: true });
      t.string("title");
      t.string("author");
      t.string("branch");
      t.string("base_branch");
      t.text("body");
      t.string("created_at");
      t.string("merged_at");
      t.string("closed_at");
      t.string("merge_commit_sha");
      t.integer("additions");
      t.integer("deletions");
      t.integer("changed_files");
      t.text("labels");
      t.integer("review_count", { default: -1 });
      t.integer("comment_count", { default: -1 });
      t.integer("commit_count", { default: 0 });
      t.integer("time_open_seconds");
      t.string("review_decision");
    });

    await ctx.createTable("pr_files", {}, (t) => {
      t.integer("pr_number");
      t.string("filename");
      t.string("status");
      t.integer("additions");
      t.integer("deletions");
      t.integer("changes");
      t.text("patch");
      t.index(["pr_number", "filename"], { unique: true });
    });

    await ctx.createTable("pr_commits", {}, (t) => {
      t.integer("pr_number");
      t.string("sha");
      t.text("message");
      t.string("author");
      t.string("authored_at");
      t.index(["pr_number", "sha"], { unique: true });
    });

    await ctx.createTable("pr_comments", { id: false }, (t) => {
      t.integer("id", { primaryKey: true });
      t.integer("pr_number");
      t.string("author");
      t.text("body");
      t.string("created_at");
      t.string("updated_at");
      t.string("comment_type");
      t.string("path");
      t.text("diff_hunk");
      t.integer("in_reply_to_id");
      t.index(["pr_number"]);
    });

    await ctx.createTable("pr_reviews", { id: false }, (t) => {
      t.integer("id", { primaryKey: true });
      t.integer("pr_number");
      t.string("author");
      t.string("state");
      t.text("body");
      t.string("submitted_at");
      t.index(["pr_number"]);
    });

    await ctx.createTable("workflow_runs", { id: false }, (t) => {
      t.integer("id", { primaryKey: true });
      t.string("head_sha");
      t.integer("pr_number");
      t.string("event");
      t.string("status");
      t.string("conclusion");
      t.string("created_at");
      t.string("updated_at");
      t.string("run_started_at");
      t.integer("duration_seconds");
      t.string("workflow_name");
      t.index(["head_sha"]);
    });

    await ctx.createTable("workflow_jobs", { id: false }, (t) => {
      t.integer("id", { primaryKey: true });
      t.integer("run_id");
      t.string("name");
      t.string("status");
      t.string("conclusion");
      t.string("started_at");
      t.string("completed_at");
      t.integer("duration_seconds");
      t.index(["run_id", "name"]);
    });

    await ctx.createTable("test_compare_stats", {}, (t) => {
      t.string("merge_commit_sha");
      t.integer("pr_number");
      t.string("package");
      t.integer("matched");
      t.integer("total");
      t.float("percent");
      t.integer("skipped", { default: 0 });
      t.integer("files_mapped", { default: 0 });
      t.integer("files_total", { default: 0 });
      t.integer("misplaced", { default: 0 });
      t.index(["merge_commit_sha", "package"], { unique: true });
    });

    await ctx.createTable("api_compare_stats", {}, (t) => {
      t.string("merge_commit_sha");
      t.integer("pr_number");
      t.string("package");
      t.integer("matched");
      t.integer("total");
      t.float("percent");
      t.integer("misplaced", { default: 0 });
      t.integer("missing", { default: 0 });
      t.index(["merge_commit_sha", "package"], { unique: true });
    });

    await ctx.createTable("compare_logs", {}, (t) => {
      t.string("merge_commit_sha");
      t.integer("pr_number");
      t.string("step_name");
      t.text("log_output");
      t.index(["merge_commit_sha", "step_name"], { unique: true });
    });

    await ctx.createTable("raw_job_logs", {}, (t) => {
      t.integer("job_id");
      t.string("merge_commit_sha");
      t.integer("pr_number");
      t.text("log_output");
      t.index(["merge_commit_sha"], { unique: true });
    });

    await ctx.createTable("sync_log", {}, (t) => {
      t.string("synced_at");
      t.integer("prs_synced", { default: 0 });
      t.integer("runs_synced", { default: 0 });
      t.integer("logs_parsed", { default: 0 });
    });

    await adapter.commit();
  } catch (err) {
    await adapter.rollback();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// GitHub API response types
// ---------------------------------------------------------------------------

interface GhPrData {
  number: number;
  title: string;
  author: { login: string } | null;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  mergeCommit: { oid: string } | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: { name: string }[];
  headRefName: string;
  baseRefName: string;
  body: string;
  reviewDecision: string | null;
}

interface GhPrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GhPrCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
}

interface GhIssueComment {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
  updated_at: string;
}

interface GhReviewComment {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
  updated_at: string;
  path: string;
  diff_hunk: string;
  in_reply_to_id?: number;
}

interface GhReview {
  id: number;
  user: { login: string } | null;
  state: string;
  body: string | null;
  submitted_at: string;
}

interface GhWorkflowRun {
  id: number;
  head_sha: string;
  event: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  name: string;
}

interface GhWorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Sync functions
// ---------------------------------------------------------------------------

async function syncPullRequests(mode: "latest" | "refresh"): Promise<number> {
  const rows = await PullRequest.findBySql("SELECT MAX(number) as number FROM pull_requests");
  const lastSynced = (rows[0]?.readAttribute("number") as number) ?? 0;
  console.log(`Last synced PR: #${lastSynced}`);

  const fields = [
    "number",
    "title",
    "author",
    "createdAt",
    "mergedAt",
    "closedAt",
    "mergeCommit",
    "additions",
    "deletions",
    "changedFiles",
    "labels",
    "headRefName",
    "baseRefName",
    "body",
    "reviewDecision",
  ].join(",");

  const limit = mode === "latest" ? 10 : 1000;
  const allPrs = ghJson<GhPrData[]>(
    `pr list --repo ${REPO} --state merged --limit ${limit} --json ${fields} --jq '[.[] | select(.number > ${lastSynced})]'`,
  );

  console.log(`Found ${allPrs.length} new merged PRs to sync`);

  if (allPrs.length > 0) {
    await PullRequest.upsertAll(
      allPrs.map((pr) => {
        const timeOpenMs =
          pr.mergedAt && pr.createdAt
            ? new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()
            : null;
        return {
          number: pr.number,
          title: pr.title,
          author: pr.author?.login ?? null,
          branch: pr.headRefName,
          base_branch: pr.baseRefName,
          body: pr.body,
          created_at: pr.createdAt,
          merged_at: pr.mergedAt,
          closed_at: pr.closedAt,
          merge_commit_sha: pr.mergeCommit?.oid ?? null,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changedFiles,
          labels: JSON.stringify(pr.labels.map((l) => l.name)),
          review_count: -1,
          comment_count: -1,
          commit_count: 0,
          time_open_seconds: timeOpenMs !== null ? Math.round(timeOpenMs / 1000) : null,
          review_decision: pr.reviewDecision ?? null,
        };
      }),
      { uniqueBy: "number" },
    );
  }

  return allPrs.length;
}

async function syncPrFiles() {
  const prsToSync = await PullRequest.findBySql(`
    SELECT p.number, p.changed_files FROM pull_requests p
    LEFT JOIN (SELECT pr_number, COUNT(*) as cnt FROM pr_files GROUP BY pr_number) f
      ON f.pr_number = p.number
    WHERE f.cnt IS NULL OR f.cnt != p.changed_files
    ORDER BY p.number
  `);

  if (prsToSync.length === 0) return;
  console.log(`Fetching file details for ${prsToSync.length} PRs...`);

  for (const pr of prsToSync) {
    const number = pr.readAttribute("number") as number;
    try {
      const files = ghJson<GhPrFile[]>(`api repos/${REPO}/pulls/${number}/files --paginate`);
      await PrFile.adapter.executeMutation(`DELETE FROM pr_files WHERE pr_number = ?`, [number]);
      if (files.length > 0) {
        await PrFile.insertAll(
          files.map((f) => ({
            pr_number: number,
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch ?? null,
          })),
        );
      }
    } catch (err) {
      console.warn(
        `  Failed to fetch files for PR #${number}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function syncPrCommits() {
  const prsToSync = await PullRequest.findBySql(
    `SELECT number FROM pull_requests WHERE commit_count = 0 ORDER BY number`,
  );

  if (prsToSync.length === 0) return;
  console.log(`Fetching commits for ${prsToSync.length} PRs...`);

  for (const pr of prsToSync) {
    const number = pr.readAttribute("number") as number;
    try {
      const commits = ghJson<GhPrCommit[]>(`api repos/${REPO}/pulls/${number}/commits --paginate`);
      await PrCommit.adapter.executeMutation(`DELETE FROM pr_commits WHERE pr_number = ?`, [
        number,
      ]);
      if (commits.length > 0) {
        await PrCommit.insertAll(
          commits.map((c) => ({
            pr_number: number,
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author.name,
            authored_at: c.commit.author.date,
          })),
        );
      }
      await PullRequest.where({ number }).updateAll({ commit_count: commits.length });
    } catch (err) {
      console.warn(
        `  Failed to fetch commits for PR #${number}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function syncPrComments() {
  const prsToSync = await PullRequest.findBySql(
    `SELECT number FROM pull_requests WHERE review_count = -1 ORDER BY number`,
  );

  if (prsToSync.length === 0) return;
  console.log(`Fetching comments for ${prsToSync.length} PRs...`);

  for (const pr of prsToSync) {
    const number = pr.readAttribute("number") as number;
    let totalComments = 0;
    try {
      const issueComments = ghJson<GhIssueComment[]>(
        `api repos/${REPO}/issues/${number}/comments --paginate`,
      );
      if (issueComments.length > 0) {
        await PrComment.upsertAll(
          issueComments.map((c) => ({
            id: c.id,
            pr_number: number,
            author: c.user?.login ?? null,
            body: c.body,
            created_at: c.created_at,
            updated_at: c.updated_at,
            comment_type: "issue",
            path: null,
            diff_hunk: null,
            in_reply_to_id: null,
          })),
          { uniqueBy: "id" },
        );
      }
      totalComments += issueComments.length;

      const reviewComments = ghJson<GhReviewComment[]>(
        `api repos/${REPO}/pulls/${number}/comments --paginate`,
      );
      if (reviewComments.length > 0) {
        await PrComment.upsertAll(
          reviewComments.map((c) => ({
            id: c.id,
            pr_number: number,
            author: c.user?.login ?? null,
            body: c.body,
            created_at: c.created_at,
            updated_at: c.updated_at,
            comment_type: "review",
            path: c.path,
            diff_hunk: c.diff_hunk,
            in_reply_to_id: c.in_reply_to_id ?? null,
          })),
          { uniqueBy: "id" },
        );
      }
      totalComments += reviewComments.length;

      const reviews = ghJson<GhReview[]>(`api repos/${REPO}/pulls/${number}/reviews --paginate`);
      if (reviews.length > 0) {
        await PrReview.upsertAll(
          reviews.map((r) => ({
            id: r.id,
            pr_number: number,
            author: r.user?.login ?? null,
            state: r.state,
            body: r.body,
            submitted_at: r.submitted_at,
          })),
          { uniqueBy: "id" },
        );
      }

      await PullRequest.where({ number }).updateAll({
        comment_count: totalComments,
        review_count: reviews.length,
      });
    } catch (err) {
      console.warn(
        `  Failed to fetch comments for PR #${number}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function syncWorkflowRuns(mode: "latest" | "refresh"): Promise<number> {
  const limitClause = mode === "latest" ? "LIMIT 10" : "";
  const missingRuns = await PullRequest.findBySql(`
    SELECT DISTINCT merge_commit_sha, number FROM pull_requests
    WHERE merge_commit_sha IS NOT NULL
    AND (
      merge_commit_sha NOT IN (SELECT head_sha FROM workflow_runs)
      OR EXISTS (
        SELECT 1 FROM workflow_runs wr
        LEFT JOIN workflow_jobs wj ON wj.run_id = wr.id
        WHERE wr.head_sha = pull_requests.merge_commit_sha
        GROUP BY wr.id HAVING COUNT(wj.id) = 0
      )
    )
    ORDER BY number DESC
    ${limitClause}
  `);

  if (missingRuns.length === 0) {
    console.log("All workflow runs already synced");
    return 0;
  }

  console.log(`Fetching workflow runs for ${missingRuns.length} merge commits...`);
  let synced = 0;

  for (const row of missingRuns) {
    const sha = row.readAttribute("merge_commit_sha") as string;
    const number = row.readAttribute("number") as number;
    try {
      const resp = ghJson<{ workflow_runs: GhWorkflowRun[] }>(
        `api repos/${REPO}/actions/runs?head_sha=${sha}&per_page=100`,
      );

      for (const run of resp.workflow_runs) {
        const duration =
          run.run_started_at && run.updated_at
            ? Math.round(
                (new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) /
                  1000,
              )
            : null;

        await WorkflowRun.upsertAll(
          [
            {
              id: run.id,
              head_sha: run.head_sha,
              pr_number: number,
              event: run.event,
              status: run.status,
              conclusion: run.conclusion,
              created_at: run.created_at,
              updated_at: run.updated_at,
              run_started_at: run.run_started_at,
              duration_seconds: duration,
              workflow_name: run.name,
            },
          ],
          { uniqueBy: "id" },
        );

        const jobsResp = ghJson<{ jobs: GhWorkflowJob[] }>(
          `api repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`,
        );

        if (jobsResp.jobs.length > 0) {
          await WorkflowJob.upsertAll(
            jobsResp.jobs.map((job) => {
              const jobDuration =
                job.started_at && job.completed_at
                  ? Math.round(
                      (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) /
                        1000,
                    )
                  : null;
              return {
                id: job.id,
                run_id: run.id,
                name: job.name,
                status: job.status,
                conclusion: job.conclusion,
                started_at: job.started_at,
                completed_at: job.completed_at,
                duration_seconds: jobDuration,
              };
            }),
            { uniqueBy: "id" },
          );
        }

        synced++;
      }
    } catch (err) {
      console.warn(
        `  Failed to fetch workflow runs for PR #${number} (${sha}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return synced;
}

// ---------------------------------------------------------------------------
// CI log parsing
// ---------------------------------------------------------------------------

function extractStepLogs(rawLog: string): Map<string, string> {
  const steps = new Map<string, string>();

  // Collect ALL ##[group] positions as step boundaries (not just "Run" groups).
  // This prevents the last comparison step from including post-job cleanup noise.
  const allGroups: number[] = [];
  const groupPattern = /##\[group\]/g;
  let gm;
  while ((gm = groupPattern.exec(rawLog)) !== null) {
    allGroups.push(gm.index);
  }

  // Find comparison steps by matching "##[group]Run <command>"
  const runPattern = /##\[group\]Run (.+)/g;
  let m;
  while ((m = runPattern.exec(rawLog)) !== null) {
    const command = m[1].trim();
    let stepName: string | null = null;

    if (command.includes("api-compare/compare.ts")) {
      stepName = "api_compare";
    } else if (
      command.includes("test-compare/test-compare.ts") ||
      command.includes("test-compare/convention-compare.ts")
    ) {
      stepName = "test_compare";
    }

    if (!stepName) continue;

    // End boundary is the next ##[group] (any kind), not just the next "Run".
    // For the last step, fall back to "Post job cleanup." as the boundary.
    const stepStart = m.index;
    const nextGroup = allGroups.find((pos) => pos > stepStart);
    let stepEnd: number;
    if (nextGroup) {
      stepEnd = nextGroup;
    } else {
      const cleanupIdx = rawLog.indexOf("Post job cleanup.", stepStart);
      stepEnd = cleanupIdx !== -1 ? cleanupIdx : rawLog.length;
    }
    const stepContent = rawLog.slice(stepStart, stepEnd);

    const cleaned = stepContent
      .split("\n")
      .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, ""))
      .join("\n")
      .trim();

    steps.set(stepName, cleaned);
  }

  return steps;
}

function parseTestCompareFromLogs(logs: string) {
  const results = new Map<
    string,
    {
      matched: number;
      total: number;
      percent: number;
      skipped: number;
      filesMapped: number;
      filesTotal: number;
      misplaced: number;
    }
  >();

  const re =
    /\s{2}(\w+)\s+—\s+(\d+)\/(\d+) tests \(([\d.]+)%\)(?:\s+\(([^)]*)\))?\s+\|\s+(\d+)\/(\d+) files\s+\|\s+(\d+) misplaced/g;
  let m;
  while ((m = re.exec(logs)) !== null) {
    if (m[1] === "Overall") continue;
    const details = m[5] ?? "";
    const skippedMatch = /(\d+)\s+skipped/.exec(details);
    results.set(m[1], {
      matched: parseInt(m[2]),
      total: parseInt(m[3]),
      percent: parseFloat(m[4]),
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
      filesMapped: parseInt(m[6]),
      filesTotal: parseInt(m[7]),
      misplaced: parseInt(m[8]),
    });
  }
  return results;
}

function parseApiCompareFromLogs(logs: string) {
  const results = new Map<
    string,
    {
      matched: number;
      total: number;
      percent: number;
      misplaced: number;
      missing: number;
    }
  >();

  // Match new method-centric format: "  arel  —  335/442 methods (75.8%)  |  files: 50/80"
  const reNew = /\s{2}(\w+)\s+—\s+(\d+)\/(\d+) methods \(([\d.]+)%\)\s+\|\s+files: (\d+)\/(\d+)/g;
  // Also match old format for parsing historical CI logs
  const reOld =
    /\s{2}(\w+)\s+—\s+(\d+)\/(\d+) classes\/modules \(([\d.]+)%\)\s+\|\s+(\d+) misplaced\s+\|\s+(\d+) missing/g;

  let m;
  while ((m = reNew.exec(logs)) !== null) {
    if (m[1] === "Overall") continue;
    results.set(m[1], {
      matched: parseInt(m[2]),
      total: parseInt(m[3]),
      percent: parseFloat(m[4]),
      misplaced: 0,
      missing: parseInt(m[3]) - parseInt(m[2]),
    });
  }
  // Fall back to old format if no new-format matches found
  if (results.size === 0) {
    while ((m = reOld.exec(logs)) !== null) {
      if (m[1] === "Overall") continue;
      results.set(m[1], {
        matched: parseInt(m[2]),
        total: parseInt(m[3]),
        percent: parseFloat(m[4]),
        misplaced: parseInt(m[5]),
        missing: parseInt(m[6]),
      });
    }
  }
  // Fall back to earliest format: "  arel: 100% (152/152)"
  // Use [a-z] to match only lowercase package names, skipping PascalCase class-level lines
  if (results.size === 0) {
    const reEarliest = / {2}([a-z]\w*): ([\d.]+)% \((\d+)\/(\d+)\)/g;
    while ((m = reEarliest.exec(logs)) !== null) {
      if (m[1] === "Overall") continue;
      results.set(m[1], {
        matched: parseInt(m[3]),
        total: parseInt(m[4]),
        percent: parseFloat(m[2]),
        misplaced: 0,
        missing: parseInt(m[4]) - parseInt(m[3]),
      });
    }
  }
  return results;
}

async function syncCompareStats(mode: "latest" | "refresh"): Promise<number> {
  const limitClause = mode === "latest" ? "LIMIT 10" : "";
  const runsToProcess = await WorkflowRun.findBySql(`
    SELECT DISTINCT wr.id, wr.head_sha, wr.pr_number
    FROM workflow_runs wr
    JOIN workflow_jobs wj ON wj.run_id = wr.id
    WHERE wj.name = 'Rails API/Test Comparison'
    AND wj.conclusion = 'success'
    AND (
      NOT EXISTS (
        SELECT 1 FROM test_compare_stats tcs
        WHERE tcs.merge_commit_sha = wr.head_sha
      )
      OR NOT EXISTS (
        SELECT 1 FROM api_compare_stats acs
        WHERE acs.merge_commit_sha = wr.head_sha
      )
      OR EXISTS (
        WITH expected(step_name) AS (VALUES ('api_compare'), ('test_compare'))
        SELECT 1 FROM expected e
        LEFT JOIN compare_logs cl
          ON cl.merge_commit_sha = wr.head_sha AND cl.step_name = e.step_name
        WHERE cl.step_name IS NULL
      )
      OR NOT EXISTS (
        SELECT 1 FROM raw_job_logs rjl
        WHERE rjl.merge_commit_sha = wr.head_sha
      )
    )
    ORDER BY wr.pr_number DESC
    ${limitClause}
  `);

  if (runsToProcess.length === 0) {
    console.log("All compare stats already synced");
    return 0;
  }

  console.log(`Parsing CI logs for ${runsToProcess.length} workflow runs...`);
  let parsed = 0;

  for (const row of runsToProcess) {
    const runId = row.readAttribute("id") as number;
    const headSha = row.readAttribute("head_sha") as string;
    const prNumber = row.readAttribute("pr_number") as number;

    const jobRows = await Base.adapter.execute(
      `SELECT id FROM workflow_jobs WHERE run_id = ? AND name = ? AND conclusion = 'success' ORDER BY completed_at DESC LIMIT 1`,
      [runId, "Rails API/Test Comparison"],
    );
    if (jobRows.length === 0) continue;
    const jobId = jobRows[0].id as number;

    try {
      const logs = gh(`api repos/${REPO}/actions/jobs/${jobId}/logs`);

      // Store full raw job log for future re-parsing
      await RawJobLog.upsertAll(
        [{ job_id: jobId, merge_commit_sha: headSha, pr_number: prNumber, log_output: logs }],
        { uniqueBy: ["merge_commit_sha"] },
      );

      // Store raw step logs
      const stepLogs = extractStepLogs(logs);
      if (stepLogs.size > 0) {
        await CompareLog.upsertAll(
          [...stepLogs.entries()].map(([stepName, output]) => ({
            merge_commit_sha: headSha,
            pr_number: prNumber,
            step_name: stepName,
            log_output: output,
          })),
          { uniqueBy: ["merge_commit_sha", "step_name"] },
        );
      }

      const testStats = parseTestCompareFromLogs(logs);
      if (testStats.size > 0) {
        await TestCompareStat.upsertAll(
          [...testStats.entries()].map(([pkg, s]) => ({
            merge_commit_sha: headSha,
            pr_number: prNumber,
            package: pkg,
            matched: s.matched,
            total: s.total,
            percent: s.percent,
            skipped: s.skipped,
            files_mapped: s.filesMapped,
            files_total: s.filesTotal,
            misplaced: s.misplaced,
          })),
          { uniqueBy: ["merge_commit_sha", "package"] },
        );
      }

      const apiStats = parseApiCompareFromLogs(logs);
      if (apiStats.size > 0) {
        await ApiCompareStat.upsertAll(
          [...apiStats.entries()].map(([pkg, s]) => ({
            merge_commit_sha: headSha,
            pr_number: prNumber,
            package: pkg,
            matched: s.matched,
            total: s.total,
            percent: s.percent,
            misplaced: s.misplaced,
            missing: s.missing,
          })),
          { uniqueBy: ["merge_commit_sha", "package"] },
        );
      }

      if (stepLogs.size > 0 || testStats.size > 0 || apiStats.size > 0) {
        parsed++;
        const totalTests = [...testStats.values()].reduce((sum, s) => sum + s.matched, 0);
        const totalApi = [...apiStats.values()].reduce((sum, s) => sum + s.matched, 0);
        const logSteps = [...stepLogs.keys()].join(", ");
        console.log(
          `  PR #${prNumber}: ${testStats.size} test packages (${totalTests} matched), ${apiStats.size} api packages (${totalApi} matched), logs: [${logSteps}]`,
        );
      }
    } catch (err) {
      console.warn(
        `  Failed to fetch logs for job ${jobId} (PR #${prNumber}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary(mode: "latest" | "refresh") {
  const count = async (table: string) => {
    const rows = await Base.adapter.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
    return (rows[0] as { cnt: number }).cnt;
  };
  const countDistinct = async (table: string, col: string) => {
    const rows = await Base.adapter.execute(`SELECT COUNT(DISTINCT ${col}) as cnt FROM ${table}`);
    return (rows[0] as { cnt: number }).cnt;
  };

  const [prCount, runCount, testStatCount, apiStatCount, logCount, rawLogCount] = await Promise.all(
    [
      count("pull_requests"),
      count("workflow_runs"),
      countDistinct("test_compare_stats", "merge_commit_sha"),
      countDistinct("api_compare_stats", "merge_commit_sha"),
      countDistinct("compare_logs", "merge_commit_sha"),
      count("raw_job_logs"),
    ],
  );

  console.log("\n=== Database Summary ===");
  console.log(`  PRs: ${prCount}`);

  if (mode === "refresh") {
    const [fileCount, commitCount, commentCount, reviewCount] = await Promise.all([
      count("pr_files"),
      count("pr_commits"),
      count("pr_comments"),
      count("pr_reviews"),
    ]);
    console.log(`  PR files: ${fileCount}`);
    console.log(`  PR commits: ${commitCount}`);
    console.log(`  PR comments: ${commentCount}`);
    console.log(`  PR reviews: ${reviewCount}`);
  }

  console.log(`  Workflow runs: ${runCount}`);
  console.log(`  Commits with test:compare stats: ${testStatCount}`);
  console.log(`  Commits with api:compare stats: ${apiStatCount}`);
  console.log(`  Commits with compare logs: ${logCount}`);
  console.log(`  Raw job logs: ${rawLogCount}`);
  console.log(`  Database: ${DB_PATH}`);

  const latestTestStats = await TestCompareStat.findBySql(`
    SELECT package, matched, total, percent, skipped
    FROM test_compare_stats
    WHERE merge_commit_sha = (
      SELECT merge_commit_sha FROM test_compare_stats ORDER BY pr_number DESC LIMIT 1
    )
    ORDER BY package
  `);

  if (latestTestStats.length > 0) {
    console.log("\n  Latest test:compare:");
    for (const row of latestTestStats) {
      const pkg = row.readAttribute("package");
      const matched = row.readAttribute("matched");
      const total = row.readAttribute("total");
      const percent = row.readAttribute("percent");
      const skipped = row.readAttribute("skipped") as number;
      const skipStr = skipped > 0 ? ` (${skipped} skipped)` : "";
      console.log(`    ${pkg}: ${matched}/${total} (${percent}%)${skipStr}`);
    }
  }

  const latestApiStats = await ApiCompareStat.findBySql(`
    SELECT package, matched, total, percent, missing
    FROM api_compare_stats
    WHERE merge_commit_sha = (
      SELECT merge_commit_sha FROM api_compare_stats ORDER BY pr_number DESC LIMIT 1
    )
    ORDER BY package
  `);

  if (latestApiStats.length > 0) {
    console.log("\n  Latest api:compare:");
    for (const row of latestApiStats) {
      const pkg = row.readAttribute("package");
      const matched = row.readAttribute("matched");
      const total = row.readAttribute("total");
      const percent = row.readAttribute("percent");
      const missing = row.readAttribute("missing") as number;
      const missStr = missing > 0 ? ` (${missing} missing)` : "";
      console.log(`    ${pkg}: ${matched}/${total} (${percent}%)${missStr}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const knownFlags = ["--latest", "--refresh", "--compare-only"];
  const unknownFlags = args.filter((a) => a.startsWith("--") && !knownFlags.includes(a));
  if (unknownFlags.length > 0) {
    console.error(`Unknown flag(s): ${unknownFlags.join(", ")}`);
    console.error("Usage: stats:sync [--latest | --refresh | --compare-only]");
    process.exit(1);
  }

  const mode: "latest" | "refresh" | "compare-only" = args.includes("--refresh")
    ? "refresh"
    : args.includes("--compare-only")
      ? "compare-only"
      : "latest";

  if (mode === "latest") {
    console.log("Running in latest mode (default). Use --refresh for full sync.\n");
  } else if (mode === "compare-only") {
    console.log("Running compare-only mode: syncing PRs, workflow runs, and compare logs.\n");
  } else {
    console.log("Running full refresh sync.\n");
  }

  const adapter = new SQLite3Adapter(DB_PATH);
  Base.adapter = adapter;

  try {
    await migrateDb(adapter);

    const fetchMode = mode === "latest" ? "latest" : "refresh";

    console.log("=== Syncing PR data ===");
    const prsSynced = await syncPullRequests(fetchMode);

    if (mode === "refresh") {
      console.log("\n=== Syncing PR files ===");
      await syncPrFiles();

      console.log("\n=== Syncing PR commits ===");
      await syncPrCommits();

      console.log("\n=== Syncing PR comments & reviews ===");
      await syncPrComments();
    }

    console.log("\n=== Syncing workflow runs ===");
    const runsSynced = await syncWorkflowRuns(fetchMode);

    console.log("\n=== Syncing compare stats from CI logs ===");
    const logsParsed = await syncCompareStats(fetchMode);

    await SyncLog.create({
      synced_at: new Date().toISOString(),
      prs_synced: prsSynced,
      runs_synced: runsSynced,
      logs_parsed: logsParsed,
    });

    await printSummary(mode === "refresh" ? "refresh" : "latest");
  } finally {
    adapter.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
