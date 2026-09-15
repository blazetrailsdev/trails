// Transport-level failures GitHub returns mid-stream. They are not rate limits
// (the message never says so), so without a retry arm the very first one aborts
// the whole nightly sync — which is exactly how the 2026-08-13 run died on
// "stream error: stream ID 1; CANCEL; received from peer", and how the
// 2026-09-15 run died on "unexpected end of JSON input": gh got an empty or
// truncated response body from the API and reported the parse, not the
// transport. It carries no HTTP status and no network words, so it needs its
// own arm.
const TRANSIENT_GH_ERROR_RE =
  /stream error|connection reset|unexpected EOF|broken pipe|i\/o timeout|TLS handshake timeout|connection refused|no such host|502 Bad Gateway|503 Service Unavailable|504 Gateway Time-?out|timeout awaiting response headers|unexpected end of JSON input/i;

export function isTransientGhError(message: string): boolean {
  return TRANSIENT_GH_ERROR_RE.test(message);
}
