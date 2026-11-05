import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import {
  DescendantsTracker,
  assertEqual,
  extractOptionsBang,
  kernelArray,
} from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import {
  classModule,
  fetch,
  include,
  isPlainHash,
  rbEqq,
  rbEqual,
  rbModName,
  rbObjClass,
  rbObjIsProc,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { ActionMailer } from "./namespaces.js";
import { Mailer as ParameterizedMailer } from "./parameterized.js";

type Block = (() => unknown) | null;

interface AssertEnqueuedEmailWithOptions {
  params?: unknown;
  args?: unknown;
  queue?: unknown;
}

interface DeliverEnqueuedEmailsOptions {
  queue?: unknown;
  at?: unknown;
}

export async function assertEmails(
  this: TestHelper,
  number: number,
  block: Block = null,
): Promise<void> {
  if (block != null) {
    const diff = (await this.captureEmails(block)).length;
    assertEqual(number, diff, `${number} emails expected, but ${diff} were sent`);
  } else {
    assertEqual(number, ActionMailer.Base.deliveries.length);
  }
}

export async function assertNoEmails(this: TestHelper, block: Block = null): Promise<void> {
  await this.assertEmails(0, block);
}

export async function assertEnqueuedEmails(
  this: TestHelper,
  number: number,
  block: Block = null,
): Promise<void> {
  const only = (job: unknown): boolean => this.deliveryJobFilter(job);
  await this.assertEnqueuedJobs(number, { only }, block);
}

export async function assertEnqueuedEmailWith(
  this: TestHelper,
  mailer: unknown,
  method: string,
  { params = null, args = null, queue = null }: AssertEnqueuedEmailWithOptions = {},
  block: Block = null,
): Promise<unknown> {
  if (mailer instanceof ParameterizedMailer) {
    params = (mailer as unknown as { _params: unknown })._params;
    mailer = (mailer as unknown as { _mailer: unknown })._mailer;
  }

  if (!rbObjIsProc(args)) args = kernelArray(args);
  const mailerClass = mailer as typeof Base;
  queue ??= mailerClass.deliverLaterQueueName ?? ActiveJobBase.defaultQueueName;

  const expected = (jobArgs: unknown[]): boolean => {
    const jobKwargs = extractOptionsBang(jobArgs);

    return (
      rbEqual([rbModName(mailerClass), String(method), "deliverNow"], jobArgs) &&
      rbEqq(params, jobKwargs.params) &&
      rbEqq(args, jobKwargs.args)
    );
  };

  return await this.assertEnqueuedWith(
    { job: mailerClass.deliveryJob, args: expected, queue: String(queue) },
    block,
  );
}

export async function assertNoEnqueuedEmails(this: TestHelper, block: Block = null): Promise<void> {
  await this.assertEnqueuedEmails(0, block);
}

export async function deliverEnqueuedEmails(
  this: TestHelper,
  { queue = null, at = null }: DeliverEnqueuedEmailsOptions = {},
  block: Block = null,
): Promise<unknown> {
  const only = (job: unknown): boolean => this.deliveryJobFilter(job);
  return await this.performEnqueuedJobs({ only, queue, at }, block);
}

export async function captureEmails(this: TestHelper, block: Block = null): Promise<Message[]> {
  const originalCount = ActionMailer.Base.deliveries.length;
  await this.deliverEnqueuedEmails({}, block);
  const newCount = ActionMailer.Base.deliveries.length;
  const diff = newCount - originalCount;
  return ActionMailer.Base.deliveries.slice(newCount - diff);
}

/**
 * @internal
 * @missingRailsArgs descendants — PERMANENT
 */
export function deliveryJobFilter(this: TestHelper, job: unknown): boolean {
  const jobClass = isPlainHash(job) ? fetch(job, "job") : rbObjClass(job);

  return [Base, ...(DescendantsTracker.descendants(Base) as (typeof Base)[])]
    .map((klass) => klass.deliveryJob)
    .includes(jobClass as typeof Base.deliveryJob);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestHelper {
  static readonly [classModule] = true;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestHelper extends ActiveJobTestHelper {
  assertEmails: typeof assertEmails;
  assertNoEmails: typeof assertNoEmails;
  assertEnqueuedEmails: typeof assertEnqueuedEmails;
  assertEnqueuedEmailWith: typeof assertEnqueuedEmailWith;
  assertNoEnqueuedEmails: typeof assertNoEnqueuedEmails;
  deliverEnqueuedEmails: typeof deliverEnqueuedEmails;
  captureEmails: typeof captureEmails;
  /** @internal */
  deliveryJobFilter: typeof deliveryJobFilter;
}
include(TestHelper, ActiveJobTestHelper);
Object.assign(TestHelper.prototype, {
  assertEmails,
  assertNoEmails,
  assertEnqueuedEmails,
  assertEnqueuedEmailWith,
  assertNoEnqueuedEmails,
  deliverEnqueuedEmails,
  captureEmails,
  deliveryJobFilter,
});
ActionMailer.TestHelper = TestHelper;
