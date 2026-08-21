// GitHub deletes workflow job logs after its retention window, so `gh api
// .../jobs/<id>/logs` answers 404 forever for an old job. The nightly sync
// selects unfetched jobs newest-first, so once every remaining job is past
// retention the whole batch 404s, nothing is fetched, and the run dies on
// JobLogFetchFailedError — which is how the 2026-08-21 catch-up run died after
// the schema-recursion fix let it get that far.
const EXPIRED_JOB_LOG_ERROR_RE = /HTTP 404/;

export function isExpiredJobLogError(message: string): boolean {
  return EXPIRED_JOB_LOG_ERROR_RE.test(message);
}
