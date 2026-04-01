import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import CheckpointPanel from "./CheckpointPanel.svelte";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../../sql-js-adapter.js";
import { VirtualFS } from "../../virtual-fs.js";
import type { CheckSpec } from "../../tutorials/types.js";

let SQL: SqlJsStatic;
let adapter: SqlJsAdapter;
let vfs: VirtualFS;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  adapter = new SqlJsAdapter(new SQL.Database());
  vfs = new VirtualFS(adapter);
});

afterEach(() => cleanup());

describe("CheckpointPanel", () => {
  it("renders verify button", () => {
    const checks: CheckSpec[] = [{ type: "file_exists", target: "test.ts" }];
    render(CheckpointPanel, { props: { checks, vfs, adapter } });
    expect(screen.getByTestId("verify-button")).toBeTruthy();
    expect(screen.getByTestId("verify-button").textContent).toContain("Verify");
  });

  it("shows all passed when checks succeed", async () => {
    vfs.write("test.ts", "content");
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    const checks: CheckSpec[] = [
      { type: "file_exists", target: "test.ts" },
      { type: "table_exists", target: "users" },
    ];
    render(CheckpointPanel, { props: { checks, vfs, adapter } });
    await fireEvent.click(screen.getByTestId("verify-button"));
    await waitFor(() => expect(screen.getByTestId("checkpoint-summary")).toBeTruthy());
    expect(screen.getByTestId("checkpoint-summary").textContent).toContain("All checks passed");
  });

  it("shows failure count when checks fail", async () => {
    const checks: CheckSpec[] = [
      { type: "file_exists", target: "missing.ts" },
      { type: "table_exists", target: "nonexistent" },
    ];
    render(CheckpointPanel, { props: { checks, vfs, adapter } });
    await fireEvent.click(screen.getByTestId("verify-button"));
    await waitFor(() => expect(screen.getByTestId("checkpoint-summary")).toBeTruthy());
    expect(screen.getByTestId("checkpoint-summary").textContent).toContain("2 of 2 checks failed");
  });

  it("shows individual check results", async () => {
    vfs.write("exists.ts", "content");
    const checks: CheckSpec[] = [
      { type: "file_exists", target: "exists.ts" },
      { type: "file_exists", target: "missing.ts" },
    ];
    render(CheckpointPanel, { props: { checks, vfs, adapter } });
    await fireEvent.click(screen.getByTestId("verify-button"));
    await waitFor(() => expect(screen.getByTestId("checkpoint-results")).toBeTruthy());

    const results = screen.getAllByTestId("check-result");
    expect(results).toHaveLength(2);
    expect(results[0].textContent).toContain("PASS");
    expect(results[1].textContent).toContain("FAIL");
  });

  it("shows mixed results for partial success", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    const checks: CheckSpec[] = [
      { type: "table_exists", target: "users" },
      { type: "file_exists", target: "missing.ts" },
    ];
    render(CheckpointPanel, { props: { checks, vfs, adapter } });
    await fireEvent.click(screen.getByTestId("verify-button"));
    await waitFor(() => expect(screen.getByTestId("checkpoint-summary")).toBeTruthy());
    expect(screen.getByTestId("checkpoint-summary").textContent).toContain("1 of 2 checks failed");
  });
});
