import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  LogSubscriber as BaseLogSubscriber,
  Notifications,
  type Logger,
} from "@blazetrails/activesupport";
import {
  setup as testHelperSetup,
  teardown as testHelperTeardown,
  wait,
  type MockLogger,
} from "@blazetrails/activesupport/log-subscriber/test-helper";
import { Time } from "@blazetrails/date";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { LogSubscriber, Process, SolidQueue } from "./index.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";

describe("LogSubscriberTest", () => {
  let oldLogger: Logger;
  const t = {
    setLogger(logger: MockLogger | null): void {
      SolidQueue.logger = logger as unknown as Logger;
    },
  } as ThisParameterType<typeof testHelperSetup>;

  beforeAll(async () => {
    await loadAppSchema();
  });

  beforeEach(() => {
    oldLogger = SolidQueue.logger;
    testHelperSetup.call(t);
  });

  afterEach(async () => {
    BaseLogSubscriber.logSubscribers().length = 0;
    testHelperTeardown.call(t);
    SolidQueue.logger = oldLogger;
    await Process.destroyAll();
  });

  function attachLogSubscriber() {
    BaseLogSubscriber.attachTo("solid_queue", new LogSubscriber());
  }

  function instrument(name: string, payload: Record<string, unknown>) {
    Notifications.instrument(name, payload);
    wait.call(t);
  }

  function assertMatchLogged(level: ":debug" | ":error", action: string, attributes: string) {
    expect(t.logger.logged(level).length).toEqual(1);
    expect(t.logger.logged(level).at(-1)).toMatch(
      new RegExp(
        `SolidQueue-[\\d.]+(\\.beta)? ${action} \\(\\d+\\.\\d+ms\\)  ${regexpEscape(attributes)}`,
      ),
    );
  }

  it("unblock one job", () => {
    attachLogSubscriber();
    instrument("release_blocked.solid_queue", {
      job_id: 42,
      concurrency_key: "foo/1",
      released: true,
    });

    assertMatchLogged(
      ":debug",
      "Release blocked job",
      'job_id: 42, concurrency_key: "foo/1", released: true',
    );
  });

  it("unblock many jobs", () => {
    attachLogSubscriber();
    instrument("release_many_blocked.solid_queue", { limit: 42, size: 10 });

    assertMatchLogged(":debug", "Unblock jobs", "limit: 42, size: 10");
  });

  it("recurring task enqueued succesfully", () => {
    attachLogSubscriber();
    const time = Time.now();
    instrument("enqueue_recurring_task.solid_queue", {
      task: ":example_task",
      active_job_id: "b944ddbc-6a37-43c0-b661-4b56e57195f5",
      at: time,
    });

    assertMatchLogged(
      ":debug",
      "Enqueued recurring task",
      `task: :example_task, active_job_id: "b944ddbc-6a37-43c0-b661-4b56e57195f5", at: "${time.iso8601()}"`,
    );
  });

  it("recurring task skipped", () => {
    attachLogSubscriber();
    const time = Time.now();
    instrument("enqueue_recurring_task.solid_queue", {
      task: ":example_task",
      skipped: true,
      at: time,
    });

    assertMatchLogged(
      ":debug",
      "Skipped recurring task – already dispatched",
      `task: :example_task, at: "${time.iso8601()}"`,
    );
  });

  it("error enqueuing recurring task", () => {
    attachLogSubscriber();
    const time = Time.now();
    instrument("enqueue_recurring_task.solid_queue", {
      task: ":example_task",
      enqueue_error: "Everything is broken",
      at: time,
    });

    assertMatchLogged(
      ":error",
      "Error enqueuing recurring task",
      `task: :example_task, enqueue_error: "Everything is broken", at: "${time.iso8601()}"`,
    );
  });

  it("deregister process", async () => {
    const process = await Process.register({
      kind: "Worker",
      pid: 42,
      hostname: "localhost",
      name: "worker-123",
    });
    const lastHeartbeatAt = process.last_heartbeat_at.iso8601();

    attachLogSubscriber();
    instrument("deregister_process.solid_queue", { process, pruned: false, claimed_size: 0 });

    assertMatchLogged(
      ":debug",
      "Deregister Worker",
      `process_id: ${process.id}, pid: 42, hostname: "localhost", name: "worker-123", last_heartbeat_at: "${lastHeartbeatAt}", claimed_size: 0, pruned: false`,
    );
  });
});
