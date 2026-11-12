import { expect, vi } from "vitest";
import { isPresent, TopLevel } from "@blazetrails/activesupport";
import { Errno, SystemExit } from "@blazetrails/ruby-compat";
import { Process } from "../../lib/process.js";
import { Supervisor } from "../../lib/supervisor.js";

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
  let exited = false;
  const running = Supervisor.start({ skipRecurring: true, ...options });
  running.then(
    () => (exited = true),
    () => (exited = true),
  );
  return {
    get isExists() {
      return !exited;
    },
    get supervisor() {
      return supervisors[0];
    },
    async terminate(signal: "TERM" | "QUIT" = "TERM") {
      const supervisor = supervisors[0];
      if (supervisor === undefined || supervisor.isStopped()) return await running;
      (supervisor as unknown as { signalQueue(): string[] }).signalQueue().push(signal);
      await (supervisor as unknown as { interrupt(): Promise<void> }).interrupt();
      await running;
    },
  };
}

export function signalProcess(
  pid: ReturnType<typeof runSupervisor> | { supervisor: Supervisor; name: string },
  signal: "TERM" | "INT" | "QUIT" | "KILL",
  { wait = null }: { wait?: number | null } = {},
) {
  return (async () => {
    if (wait != null) await sleep(wait);
    const supervisor = pid.supervisor;
    if (!("name" in pid)) {
      supervisor.signalQueue().push(signal);
      await supervisor.interrupt();
      return;
    }
    const supervisee = supervisor.forks[pid.name];
    if (supervisee == null) throw new Errno.ESRCH();
    if (signal === "KILL") supervisee._thread.kill();
    else supervisor.signalProcess(pid.name, signal);
  })();
}

export async function waitWhileWithTimeout(timeout: number, block: () => Promise<boolean>) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await block())) await sleep(0.05);
}

export async function waitForRegisteredProcesses(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(timeout, async () => (await Process.count()) !== count);
}

export async function assertNoRegisteredProcesses() {
  expect(await Process.isNone()).toBeTruthy();
}

export async function assertRegisteredProcesses({
  kind,
  count = 1,
  supervisorPid = null,
  ...attributes
}: {
  kind: string;
  count?: number;
  supervisorPid?: number | null;
  [attr: string]: unknown;
}) {
  const processes = await Process.where({ kind }).toArray();
  expect(processes.length).toEqual(count);

  if (supervisorPid != null) {
    for (const process of processes) {
      expect((await process.supervisor)!.pid).toEqual(supervisorPid);
    }
  }

  for (const [attr, value] of Object.entries(attributes)) {
    for (const process of processes) {
      const actual = (process as unknown as Record<string, unknown>)[attr];
      if (isPresent(value)) {
        expect(actual).toEqual(value);
      } else {
        expect(actual).toBeNull();
      }
    }
  }
}

export function assertMetadata(process: Process, metadata: Record<string, unknown>) {
  for (const [attr, value] of Object.entries(metadata)) {
    expect(process.metadata.get(attr)).toEqual(value);
  }
}

export function findProcessesRegisteredAs(kind: string) {
  return Process.where({ kind });
}

export async function waitForProcessTerminationWithTimeout(
  run: ReturnType<typeof runSupervisor>,
  { exitstatus = 0 }: { exitstatus?: number } = {},
) {
  const error = await run.terminate().then(
    () => null,
    (e: unknown) => e,
  );
  if (error !== null && !(error instanceof SystemExit)) throw error;
  expect(exitstatus != null, String(error?.status ?? 0)).toBe(true);
}
