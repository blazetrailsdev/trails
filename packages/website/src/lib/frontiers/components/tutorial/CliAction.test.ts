import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import CliAction from "./CliAction.svelte";
import type { CliResult } from "../../trail-cli.js";

function mockExec(result: Partial<CliResult> = {}): (cmd: string) => Promise<CliResult> {
  return vi.fn().mockResolvedValue({
    success: true,
    output: ["output line 1", "output line 2"],
    exitCode: 0,
    ...result,
  });
}

afterEach(() => cleanup());

describe("CliAction", () => {
  it("renders command and run button", () => {
    render(CliAction, { props: { command: "new myapp", exec: mockExec() } });
    expect(screen.getByText("new myapp")).toBeTruthy();
    expect(screen.getByTestId("run-button")).toBeTruthy();
    expect(screen.getByTestId("run-button").textContent).toContain("Run");
  });

  it("shows output after running", async () => {
    const exec = mockExec();
    render(CliAction, { props: { command: "new myapp", exec } });

    await fireEvent.click(screen.getByTestId("run-button"));
    await waitFor(() => expect(screen.getByTestId("cli-output")).toBeTruthy());

    expect(screen.getByTestId("cli-output").textContent).toContain("output line 1");
    expect(exec).toHaveBeenCalledWith("new myapp");
  });

  it("shows Re-run after first execution", async () => {
    render(CliAction, { props: { command: "test", exec: mockExec() } });
    await fireEvent.click(screen.getByTestId("run-button"));
    await waitFor(() => expect(screen.getByTestId("run-button").textContent).toContain("Re-run"));
  });

  it("shows error styling on failure", async () => {
    const exec = mockExec({ success: false, output: ["something failed"] });
    render(CliAction, { props: { command: "bad", exec } });
    await fireEvent.click(screen.getByTestId("run-button"));
    await waitFor(() => expect(screen.getByTestId("cli-output")).toBeTruthy());
    expect(screen.getByTestId("cli-output").className).toContain("text-error");
  });

  it("calls onoutput callback", async () => {
    const onoutput = vi.fn();
    render(CliAction, {
      props: { command: "test", exec: mockExec(), onoutput },
    });
    await fireEvent.click(screen.getByTestId("run-button"));
    await waitFor(() => expect(onoutput).toHaveBeenCalledWith(["output line 1", "output line 2"]));
  });

  it("disables button while running", async () => {
    let resolve: (v: CliResult) => void;
    const exec = vi.fn().mockReturnValue(
      new Promise<CliResult>((r) => {
        resolve = r;
      }),
    );
    render(CliAction, { props: { command: "slow", exec } });
    await fireEvent.click(screen.getByTestId("run-button"));
    expect(screen.getByTestId("run-button").textContent).toContain("Running");
    expect((screen.getByTestId("run-button") as HTMLButtonElement).disabled).toBe(true);

    resolve!({ success: true, output: [], exitCode: 0 });
    await waitFor(() => expect(screen.getByTestId("run-button").textContent).toContain("Re-run"));
  });
});
