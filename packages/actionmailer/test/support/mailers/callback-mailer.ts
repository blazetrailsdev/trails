import { cattrAccessor } from "@blazetrails/activesupport";
import { StandardError, TopLevel, block, constSet, kernelThrow } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";

export class CallbackMailerError extends StandardError {}
constSet(TopLevel, "CallbackMailerError", CallbackMailerError);

type Callable = (...args: unknown[]) => unknown;
type CallbackHost = Record<
  "beforeDeliver" | "afterDeliver" | "aroundDeliver",
  (f: Callable) => void
> & {
  rescueFrom(...args: unknown[]): void;
};

export class CallbackMailer extends Base {
  declare static rescueFromError: unknown;
  declare static afterDeliverInstance: unknown;
  declare static aroundDeliverInstance: unknown;
  declare static abortBeforeDeliver: unknown;
  declare static aroundHandlesError: unknown;

  static {
    cattrAccessor.call(
      this,
      "rescueFromError",
      "afterDeliverInstance",
      "aroundDeliverInstance",
      "abortBeforeDeliver",
      "aroundHandlesError",
    );

    const host = this as unknown as CallbackHost;

    host.rescueFrom(
      CallbackMailerError,
      block(function (error: unknown) {
        CallbackMailer.rescueFromError = error;
      }),
    );

    host.beforeDeliver(() => {
      if (CallbackMailer.abortBeforeDeliver) kernelThrow(":abort");
    });

    host.afterDeliver(function (this: unknown) {
      CallbackMailer.afterDeliverInstance = this;
    });

    host.aroundDeliver(async function (this: unknown, _mailer: unknown, block: unknown) {
      CallbackMailer.aroundDeliverInstance = this;
      try {
        await (block as () => unknown)();
      } catch (e) {
        if (!(e instanceof StandardError)) throw e;
        if (!CallbackMailer.aroundHandlesError) throw e;
      }
    });
  }

  testMessage(..._args: unknown[]) {
    return this.mail({
      from: "test-sender@test.com",
      to: "test-receiver@test.com",
      subject: "Test Subject",
      body: "Test Body",
    });
  }

  testRaiseAction(): never {
    throw new CallbackMailerError("boom action processing");
  }
}
constSet(TopLevel, "CallbackMailer", CallbackMailer);
