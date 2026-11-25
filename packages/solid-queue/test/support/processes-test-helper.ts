import { Pathname } from "@blazetrails/ruby-compat";
import { expect, vi } from "vitest";
import { isPresent, TopLevel } from "@blazetrails/activesupport";
import {
  Errno,
  IO,
  Process as RbProcess,
  SystemExit,
  Thread,
  Timeout,
  getProcessAdapter,
  rbFSleep as sleep,
  rbFFork,
  signo2signm,
} from "@blazetrails/ruby-compat";
import { Process } from "../../lib/process.js";
import { SolidQueue } from "../../lib/solid-queue.js";
import { Record as SolidQueueRecord } from "../../lib/record.js";
import { Supervisor } from "../../lib/supervisor.js";

const dummyRoot = `${import.meta.dirname}/dummy`;

type Status = InstanceType<typeof RbProcess.Status>;

function forkSupervisor(
  options: { [key: string]: unknown },
  capturedIo: boolean,
  pipes: IO[],
  configuration: object | null = null,
) {
  return rbFFork(
    `${import.meta.dirname}/supervisor-fork-entry.js`,
    {
      boot: `${dummyRoot}/config/environment.ts`,
      root: dummyRoot,
      supervisorPidfile: SolidQueue.supervisorPidfile,
      forkBootTimeout: SolidQueue.forkBootTimeout.toF(),
      configuration,
      options: { skipRecurring: true, ...options },
      capturedIo,
    },
    pipes as Parameters<typeof rbFFork>[2],
  );
}

export function forkStalledSupervisor(configuration: object): number {
  return forkSupervisor({}, false, [], configuration);
}

export function runSupervisorAsFork(options: { [key: string]: unknown } = {}): number {
  return forkSupervisor(options, false, []);
}

export async function runSupervisorAsForkWithCapturedIo(
  options: { [key: string]: unknown } = {},
): Promise<[number, string, string]> {
  const [outReader, outWriter] = IO.pipe();
  const [errReader, errWriter] = IO.pipe();
  const pid = forkSupervisor(options, true, [outWriter, errWriter]);
  outWriter.close();
  errWriter.close();
  await waitForRegisteredProcesses(4, { timeout: 10, whileAlive: pid });
  const [out, err] = [outReader, errReader].map((reader) => {
    const bytes = reader.readNonblock(1 << 20, null, { exception: false });
    return bytes instanceof Uint8Array ? new TextDecoder().decode(bytes) : "";
  });

  return [pid, out, err];
}

export function reapProcesses(): void {
  try {
    RbProcess.waitpid2(-1, RbProcess.WNOHANG);
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

async function waitpid2(pid: number): Promise<[number, Status]> {
  let waited: [number, Status] | null;
  while ((waited = RbProcess.waitpid2(-1, RbProcess.WNOHANG))?.[0] !== pid) await sleep(0.01);
  return waited!;
}

export function runSupervisor(options: { [key: string]: unknown } = {}, block?: () => void) {
  vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(new Pathname(dummyRoot));
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

type Signal = "TERM" | "INT" | "QUIT" | "KILL";
export function signalProcess(
  pid: number,
  signal: Signal,
  options?: { wait?: number | null },
): Thread;
export function signalProcess(
  pid: ReturnType<typeof runSupervisor>,
  signal: Signal,
  options?: { wait?: number | null },
): Promise<void>;
export function signalProcess(
  pid: number | ReturnType<typeof runSupervisor>,
  signal: Signal,
  { wait = null }: { wait?: number | null } = {},
): Thread | Promise<void> {
  if (typeof pid === "number") {
    return new Thread(async () => {
      if (wait != null) await sleep(wait);
      RbProcess.kill(signal, pid);
    });
  }
  return (async () => {
    if (wait != null) await sleep(wait);
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

export async function waitForRegisteredProcesses(
  count: number,
  { timeout = 1, whileAlive }: { timeout?: number; whileAlive?: number } = {},
) {
  await waitWhileWithTimeout(
    timeout,
    async () =>
      (await Process.count()) !== count &&
      (whileAlive === undefined || isProcessExists(whileAlive)),
  );
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
  if (typeof pid === "number") signalProcess(pid, signal);
  else await signalProcess(pid, signal);
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
        if (isProcessExists(run)) {
          try {
            const status = (await waitpid2(run))[1];
            if (status.exitstatus() != null && exitstatus != null) {
              expect(
                status.exitstatus(),
                `Expected pid ${run} to exit with status ${exitstatus}`,
              ).toEqual(exitstatus);
            }
            if (status.termsig() != null) {
              expect(
                signo2signm(status.termsig()!),
                `Expected pid ${run} to be terminated with signal ${signaled}`,
              ).toEqual(signaled);
            }
          } catch (error) {
            if (!(error instanceof Errno.ECHILD)) throw error;
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
    if (error instanceof Timeout.Error) {
      if (typeof run === "number") signalProcess(run, "KILL");
      else await signalProcess(run, "KILL");
    }
    throw error;
  }
}
