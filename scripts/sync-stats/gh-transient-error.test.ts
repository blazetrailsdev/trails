import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  isTransientGhError,
  TRANSIENT_GH_FAILURE_MARKER,
  transientGhFailureLine,
} from "./gh-transient-error.js";

const dir = fileURLToPath(new URL(".", import.meta.url));

describe("isTransientGhError", () => {
  it("matches the HTTP/2 stream cancel that broke the 2026-08-13 sync", () => {
    const msg = [
      "Command failed: gh pr list --repo blazetrailsdev/trails --state all --limit 1000",
      "stream error: stream ID 1; CANCEL; received from peer",
    ].join("\n");
    expect(isTransientGhError(msg)).toBe(true);
  });

  it("matches the empty response body that broke the 2026-09-15 sync", () => {
    const msg = [
      "Command failed: gh pr list --repo blazetrailsdev/trails --state all --limit 1000",
      "unexpected end of JSON input",
    ].join("\n");
    expect(isTransientGhError(msg)).toBe(true);
  });

  it.each([
    "read tcp 10.0.0.1:443: connection reset by peer",
    "unexpected EOF",
    "dial tcp: i/o timeout",
    "net/http: TLS handshake timeout",
    "dial tcp: lookup api.github.com: no such host",
    "HTTP 502 Bad Gateway",
    "HTTP 503 Service Unavailable",
    "HTTP 504 Gateway Timeout",
  ])("treats %j as transient", (msg) => {
    expect(isTransientGhError(msg)).toBe(true);
  });

  it.each([
    "GraphQL: Could not resolve to a Repository with the name 'nope'",
    "gh: Not Found (HTTP 404)",
    "unknown flag: --jqq",
    "HTTP 422: Validation Failed",
  ])("does not treat %j as transient", (msg) => {
    expect(isTransientGhError(msg)).toBe(false);
  });
});

describe("transientGhFailureLine", () => {
  it("names the transient line of a gh failure, behind the marker", () => {
    const msg = [
      "Command failed: gh pr list --repo blazetrailsdev/trails --state all --limit 1000",
      "unexpected end of JSON input",
    ].join("\n");
    expect(transientGhFailureLine(msg)).toBe(
      `${TRANSIENT_GH_FAILURE_MARKER}: unexpected end of JSON input`,
    );
  });

  it("is null for a failure outside the transient set", () => {
    expect(transientGhFailureLine("gh: Not Found (HTTP 404)")).toBeNull();
  });

  it("is the marker cron-wrapper.sh matches for its outer retry", async () => {
    const wrapper = await readFile(`${dir}cron-wrapper.sh`, "utf8");
    expect(wrapper).toContain(`TRANSIENT_GH_FAILURE_MARKER="${TRANSIENT_GH_FAILURE_MARKER}"`);
    expect(wrapper).toContain('grep -qF "$TRANSIENT_GH_FAILURE_MARKER" "$tmplog"');
  });
});
