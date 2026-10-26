import { vi } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { Process } from "../process.js";
import { Supervisor } from "../supervisor.js";

export const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

const dummyRoot = `${import.meta.dirname}/dummy`;

export function runSupervisor(options: { [key: string]: unknown } = {}) {
  vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(dummyRoot);
  const supervisors: Supervisor[] = [];
  const started = vi.spyOn(Supervisor.prototype, "start").mockImplementationOnce(function (
    this: Supervisor,
  ) {
    supervisors.push(this);
    started.mockRestore();
    return this.start();
  });
  const running = Supervisor.start({ skipRecurring: true, ...options });
  running.catch(() => {});
  return {
    get supervisor() {
      return supervisors[0];
    },
    async terminate(signal: "TERM" | "QUIT" = "TERM") {
      const supervisor = supervisors[0];
      if (supervisor.isStopped()) return await running;
      (supervisor as unknown as { signalQueue(): string[] }).signalQueue().push(signal);
      await (supervisor as unknown as { interrupt(): Promise<void> }).interrupt();
      await running;
    },
  };
}

export async function waitWhileWithTimeout(timeout: number, block: () => Promise<boolean>) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await block())) await sleep(0.05);
}

export async function waitForRegisteredProcesses(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(timeout, async () => (await Process.count()) !== count);
}
