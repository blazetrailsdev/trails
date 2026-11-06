import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { assertEqual, extractOptionsBang, kernelArray } from "@blazetrails/activesupport";
import type { Message } from "@blazetrails/mail";
import {
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

export const TestHelper = {
  async assertEmails(this: TestHelper, number: number, block: Block = null): Promise<void> {
    if (block != null) {
      const diff = (await this.captureEmails(block)).length;
      assertEqual(number, diff, `${number} emails expected, but ${diff} were sent`);
    } else {
      assertEqual(number, ActionMailer.Base.deliveries.length);
    }
  },

  async assertNoEmails(this: TestHelper, block: Block = null): Promise<void> {
    await this.assertEmails(0, block);
  },

  async assertEnqueuedEmails(this: TestHelper, number: number, block: Block = null): Promise<void> {
    const only = (job: unknown): boolean => this.deliveryJobFilter(job);
    await this.assertEnqueuedJobs(number, { only }, block);
  },

  async assertEnqueuedEmailWith(
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
        rbEqq(params, jobKwargs.params ?? null) &&
        rbEqq(args, jobKwargs.args ?? null)
      );
    };

    return await this.assertEnqueuedWith(
      { job: mailerClass.deliveryJob, args: expected, queue: String(queue) },
      block,
    );
  },

  async assertNoEnqueuedEmails(this: TestHelper, block: Block = null): Promise<void> {
    await this.assertEnqueuedEmails(0, block);
  },

  async deliverEnqueuedEmails(
    this: TestHelper,
    { queue = null, at = null }: DeliverEnqueuedEmailsOptions = {},
    block: Block = null,
  ): Promise<unknown> {
    const only = (job: unknown): boolean => this.deliveryJobFilter(job);
    return await this.performEnqueuedJobs({ only, queue, at }, block);
  },

  async captureEmails(this: TestHelper, block: Block = null): Promise<Message[]> {
    const originalCount = ActionMailer.Base.deliveries.length;
    await this.deliverEnqueuedEmails({}, block);
    const newCount = ActionMailer.Base.deliveries.length;
    const diff = newCount - originalCount;
    return ActionMailer.Base.deliveries.slice(newCount - diff);
  },

  /** @internal */
  deliveryJobFilter(this: TestHelper, job: unknown): boolean {
    const jobClass = isPlainHash(job) ? fetch(job, "job") : rbObjClass(job);

    return [Base, ...(Base as typeof Base & { descendants: (typeof Base)[] }).descendants]
      .map((klass) => klass.deliveryJob)
      .includes(jobClass as typeof Base.deliveryJob);
  },
};
export interface TestHelper
  extends ActiveJobTestHelper, Omit<typeof TestHelper, "deliveryJobFilter"> {
  /** @internal */
  deliveryJobFilter(job: unknown): boolean;
}
include(TestHelper, ActiveJobTestHelper);
ActionMailer.TestHelper = TestHelper;
