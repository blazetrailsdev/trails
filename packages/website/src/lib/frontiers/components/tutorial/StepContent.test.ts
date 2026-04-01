import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import StepContent from "./StepContent.svelte";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../../sql-js-adapter.js";
import { VirtualFS } from "../../virtual-fs.js";
import type { TutorialStep } from "../../tutorials/types.js";
import type { CliResult } from "../../trail-cli.js";

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

function mockExec(): (cmd: string) => Promise<CliResult> {
  return vi.fn().mockResolvedValue({ success: true, output: ["done"], exitCode: 0 });
}

const baseStep: TutorialStep = {
  title: "Your First Model",
  panes: ["editor", "terminal"],
  description: ["Create a User model with name and email attributes."],
  actions: [],
  checkpoint: [],
};

describe("StepContent", () => {
  it("renders step title", () => {
    render(StepContent, {
      props: { step: baseStep, exec: mockExec(), vfs, adapter },
    });
    expect(screen.getByText("Your First Model")).toBeTruthy();
  });

  it("renders description paragraphs", () => {
    const step = {
      ...baseStep,
      description: ["First paragraph.", "Second paragraph."],
    };
    render(StepContent, {
      props: { step, exec: mockExec(), vfs, adapter },
    });
    expect(screen.getByText("First paragraph.")).toBeTruthy();
    expect(screen.getByText("Second paragraph.")).toBeTruthy();
  });

  it("renders CLI actions", async () => {
    const step: TutorialStep = {
      ...baseStep,
      actions: [{ command: "generate model User name:string" }],
    };
    render(StepContent, {
      props: { step, exec: mockExec(), vfs, adapter },
    });
    expect(screen.getByText("generate model User name:string")).toBeTruthy();
    expect(screen.getByTestId("run-button")).toBeTruthy();
  });

  it("renders diff actions", () => {
    vfs.write("test.ts", "original content");
    const step: TutorialStep = {
      ...baseStep,
      actions: [
        {
          path: "test.ts",
          operation: "modify",
          hunks: [{ anchor: "original", position: "after", insertLines: ["new line"] }],
        },
      ],
    };
    render(StepContent, {
      props: { step, exec: mockExec(), vfs, adapter },
    });
    expect(screen.getByTestId("diff-viewer")).toBeTruthy();
    expect(screen.getByTestId("apply-button")).toBeTruthy();
  });

  it("renders checkpoint when checks are present", () => {
    const step: TutorialStep = {
      ...baseStep,
      checkpoint: [{ type: "file_exists", target: "test.ts" }],
    };
    render(StepContent, {
      props: { step, exec: mockExec(), vfs, adapter },
    });
    expect(screen.getByTestId("checkpoint-panel")).toBeTruthy();
    expect(screen.getByTestId("verify-button")).toBeTruthy();
  });

  it("does not render checkpoint when no checks", () => {
    render(StepContent, {
      props: { step: baseStep, exec: mockExec(), vfs, adapter },
    });
    expect(screen.queryByTestId("checkpoint-panel")).toBeNull();
  });
});
