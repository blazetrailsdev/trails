import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import DiffViewer from "./DiffViewer.svelte";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../../sql-js-adapter.js";
import { VirtualFS } from "../../virtual-fs.js";
import type { FileDiff } from "../../tutorials/types.js";

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

describe("DiffViewer", () => {
  it("renders file path and operation for create diff", () => {
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content: "class User extends Base {}",
    };
    render(DiffViewer, { props: { diff, vfs } });
    expect(screen.getByTestId("file-link").textContent).toBe("app/models/user.ts");
    expect(screen.getByTestId("diff-content")).toBeTruthy();
  });

  it("shows context around anchor for modify diffs", () => {
    vfs.write(
      "app/models/user.ts",
      ["class User extends Base {", '  this.attribute("name", "string");', "}"].join("\n"),
    );
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
      ],
    };
    render(DiffViewer, { props: { diff, vfs } });
    expect(screen.getByTestId("diff-context")).toBeTruthy();
    expect(screen.getByTestId("diff-context").textContent).toContain('this.attribute("name"');
    expect(screen.getByTestId("diff-context").textContent).toContain('this.attribute("email"');
  });

  it("applies diff on Apply button click", async () => {
    vfs.write("app/models/user.ts", "class User extends Base {}");
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "class User",
          position: "after",
          insertLines: ["  // added line"],
        },
      ],
    };
    render(DiffViewer, { props: { diff, vfs } });
    await fireEvent.click(screen.getByTestId("apply-button"));
    expect(vfs.read("app/models/user.ts")!.content).toContain("// added line");
    await waitFor(() =>
      expect(screen.getByTestId("apply-button").textContent).toContain("Applied"),
    );
  });

  it("shows Applied state when diff is already applied", () => {
    vfs.write("app/models/user.ts", "class User extends Base {}");
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content: "class User extends Base {}",
    };
    render(DiffViewer, { props: { diff, vfs } });
    expect(screen.getByTestId("apply-button").textContent).toContain("Applied");
  });

  it("shows delete message for delete diffs", () => {
    vfs.write("old-file.ts", "content");
    const diff: FileDiff = { path: "old-file.ts", operation: "delete" };
    render(DiffViewer, { props: { diff, vfs } });
    expect(screen.getByTestId("diff-delete").textContent).toContain("deleted");
  });

  it("calls onfileclick when file path is clicked", () => {
    const onfileclick = vi.fn();
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content: "class User {}",
    };
    render(DiffViewer, { props: { diff, vfs, onfileclick } });
    fireEvent.click(screen.getByTestId("file-link"));
    expect(onfileclick).toHaveBeenCalledWith("app/models/user.ts");
  });

  it("calls onapplied callback after applying", () => {
    vfs.write("test.ts", "original");
    const onapplied = vi.fn();
    const diff: FileDiff = {
      path: "test.ts",
      operation: "modify",
      hunks: [{ anchor: "original", position: "after", insertLines: ["new line"] }],
    };
    render(DiffViewer, { props: { diff, vfs, onapplied } });
    fireEvent.click(screen.getByTestId("apply-button"));
    expect(onapplied).toHaveBeenCalled();
  });

  it("shows error when diff fails to apply", async () => {
    vfs.write("test.ts", "no matching anchor here");
    const diff: FileDiff = {
      path: "test.ts",
      operation: "modify",
      hunks: [{ anchor: "nonexistent", position: "after", insertLines: ["new"] }],
    };
    render(DiffViewer, { props: { diff, vfs } });
    await fireEvent.click(screen.getByTestId("apply-button"));
    await waitFor(() => expect(screen.getByTestId("diff-error")).toBeTruthy());
  });
});
