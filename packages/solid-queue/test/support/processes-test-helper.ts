import { expect, vi } from "vitest";
import { isPresent, TopLevel } from "@blazetrails/activesupport";
import {
  Errno,
  IO,
  Process as RbProcess,
  SystemExit,
  Timeout,
  getProcessAdapter,
  rbFFork,
} from "@blazetrails/ruby-compat";
import { Process } from "../../lib/process.js";
import { SolidQueue } from "../../lib/solid-queue.js";
import { Record as SolidQueueRecord } from "../../lib/record.js";
import { Supervisor } from "../../lib/supervisor.js";

export const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

const dummyRoot = `${import.meta.dirname}/dummy`;

type Status = InstanceType<typeof RbProcess.Status>;
const SIGNALS: { [signo: number]: string } = { 2: "INT", 3: "QUIT", 9: "KILL", 15: "TERM" };
const forkedSupervisors = new Set<number>();
const reaped = new Map<number, Status>();

function forkSupervisor(options: { [key: string]: unknown }, capturedIo: boolean, pipes: IO[]) {
  const pid = rbFFork(
    `${import.meta.dirname}/supervisor-fork-entry.js`,
    {
      boot: `${dummyRoot}/config/environment.ts`,
      root: dummyRoot,
      supervisorPidfile: SolidQueue.supervisorPidfile,
      options: { skipRecurring: true, ...options },
      capturedIo,
    },
    pipes as Parameters<typeof rbFFork>[2],
  );
  forkedSupervisors.add(pid);
  return pid;
}

export function runSupervisorAsFork(options: { [key: string]: unknown } = {}): number {
  return forkSupervisor(options, false, []);
}

export async function runSupervisorAsForkWithCapturedIo(
  options: { [key: string]: unknown } = {},
): Promise<[number, string, string]> {
  const [reader, writer] = IO.pipe();
  const pid = forkSupervisor(options, true, [writer]);
  writer.close();
  await waitForRegisteredProcesses(4, { timeout: 10 });
  const err = reader.readNonblock(1 << 20, null, { exception: false });
  return [pid, "", err instanceof Uint8Array ? new TextDecoder().decode(err) : ""];
}

export function reapProcesses(): void {
  try {
    let waited: [number, Status] | null;
    while ((waited = RbProcess.waitpid2(-1, RbProcess.WNOHANG)) !== null) {
      reaped.set(waited[0], waited[1]);
    }
  } catch (error) {
    if (!(error instanceof Errno.ECHILD)) throw error;
  }
}

export function isProcessExists(pid: number): boolean {
  reapProcesses();
  try {
    RbProcess.kill(0, pid);
    return true;
  } catch (error) {
    if (error instanceof Errno.ESRCH) return false;
    throw error;
  }
}

async function waitpid2(pid: number): Promise<Status | null> {
  while (forkedSupervisors.has(pid) ? !reaped.has(pid) : isProcessExists(pid)) {
    reapProcesses();
    await sleep(0.01);
  }
  return reaped.get(pid) ?? null;
}

export function runSupervisor(options: { [key: string]: unknown } = {}, block?: () => void) {
  vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(dummyRoot);
  const supervisors: Supervisor[] = [];
  const started = vi.spyOn(Supervisor.prototype, "start").mockImplementationOnce(function (
    this: Supervisor,
  ) {
    supervisors.push(this);
    started.mockRestore();
    return this.start();
  });
  vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
    throw new SystemExit(code ?? 0);
  });
  let exited = false;
  block?.();
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
  pid: number | ReturnType<typeof runSupervisor>,
  signal: "TERM" | "INT" | "QUIT" | "KILL",
  { wait = null }: { wait?: number | null } = {},
) {
  return (async () => {
    if (wait != null) await sleep(wait);
    if (typeof pid === "number") {
      RbProcess.kill(signal, pid);
      return;
    }
    const supervisor = pid.supervisor;
    supervisor.signalQueue().push(signal);
    await supervisor.interrupt();
  })();
}

export async function waitWhileWithTimeout(timeout: number, block: () => Promise<boolean>) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await block())) await sleep(0.05);
}

export async function waitFor(
  { timeout = 1, interval = 0.05 }: { timeout?: number; interval?: number } = {},
  block: () => Promise<boolean>,
) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end) {
    if (await SolidQueueRecord.uncached(block)) return;
    await sleep(interval);
  }
  throw new Timeout.Error("execution expired");
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

export async function terminateProcess(
  pid: number | ReturnType<typeof runSupervisor>,
  {
    timeout = 10,
    signal = "TERM",
  }: { timeout?: number; signal?: "TERM" | "INT" | "QUIT" | "KILL" } = {},
) {
  await signalProcess(pid, signal);
  await waitForProcessTerminationWithTimeout(pid, { timeout, signaled: signal });
}

export async function waitForProcessTerminationWithTimeout(
  run: number | ReturnType<typeof runSupervisor>,
  {
    timeout = 10,
    exitstatus = 0,
    signaled = null,
  }: { timeout?: number; exitstatus?: number | null; signaled?: string | null } = {},
) {
  try {
    await Timeout.timeout(timeout, null, null, async () => {
      if (typeof run === "number") {
        if (isProcessExists(run) || reaped.has(run)) {
          const status = await waitpid2(run);
          if (status === null) return;
          if (status.exitstatus() != null && exitstatus != null) {
            expect(
              status.exitstatus(),
              `Expected pid ${run} to exit with status ${exitstatus}`,
            ).toEqual(exitstatus);
          }
          if (status.termsig() != null) {
            expect(
              SIGNALS[status.termsig()!],
              `Expected pid ${run} to be terminated with signal ${signaled}`,
            ).toEqual(signaled);
          }
        }
      } else if (run.isExists) {
        const error = await run.terminate().then(
          () => null,
          (e: unknown) => e,
        );
        if (error !== null && !(error instanceof SystemExit)) throw error;
        const status = error?.status ?? 0;
        if (exitstatus != null) {
          expect(status, `Expected supervisor to exit with status ${exitstatus}`).toEqual(
            exitstatus,
          );
        }
      }
    });
  } catch (error) {
    if (error instanceof Timeout.Error) await signalProcess(run, "KILL");
    throw error;
  }
}
