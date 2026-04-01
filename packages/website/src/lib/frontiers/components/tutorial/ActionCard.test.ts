import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import ActionCard from "./ActionCard.svelte";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../../sql-js-adapter.js";
import { VirtualFS } from "../../virtual-fs.js";
import type { CliResult } from "../../trail-cli.js";

let SQL: SqlJsStatic;
let vfs: VirtualFS;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  const adapter = new SqlJsAdapter(new SQL.Database());
  vfs = new VirtualFS(adapter);
});

afterEach(() => cleanup());

function mockExec(): (cmd: string) => Promise<CliResult> {
  return vi.fn().mockResolvedValue({ success: true, output: [], exitCode: 0 });
}

describe("ActionCard", () => {
  it("renders CliAction for command actions", () => {
    render(ActionCard, {
      props: { action: { command: "new myapp" }, exec: mockExec(), vfs },
    });
    expect(screen.getByTestId("run-button")).toBeTruthy();
    expect(screen.getByText("new myapp")).toBeTruthy();
  });

  it("renders DiffViewer for diff actions", () => {
    vfs.write("test.ts", "content");
    render(ActionCard, {
      props: {
        action: {
          path: "test.ts",
          operation: "create" as const,
          content: "new content",
        },
        exec: mockExec(),
        vfs,
      },
    });
    expect(screen.getByTestId("diff-viewer")).toBeTruthy();
    expect(screen.getByTestId("apply-button")).toBeTruthy();
  });
});
