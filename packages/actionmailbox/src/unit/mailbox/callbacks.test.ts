import { beforeEach, describe, expect, it } from "vitest";
import type { MessageDelivery } from "@blazetrails/actionmailer/message-delivery";
import { BounceMailer } from "../../test-helpers/test-helper.js";
import "../../inbound-email.js";
import type { InboundEmail } from "../../inbound-email.js";
import { Base } from "../../base.js";
import { TestCase } from "../../test-case.js";

let $beforeProcessing: unknown;
let $afterProcessing: unknown;
let $aroundProcessing: unknown;
let $processed: unknown;

const bounceMailer = BounceMailer as unknown as { bounce(o: { to: unknown }): MessageDelivery };

class CallbackMailbox extends Base {
  static {
    this.beforeProcessing(() => {
      $beforeProcessing = "Ran that!";
    });
    this.afterProcessing(() => {
      $afterProcessing = "Ran that too!";
    });
    this.aroundProcessing(async (_r: unknown, block: () => unknown) => {
      await block();
      $aroundProcessing = "Ran that as well!";
    });
  }

  async process(): Promise<void> {
    $processed = (await this.mail()).subject();
  }
}

class BouncingCallbackMailbox extends Base {
  static {
    this.beforeProcessing(() => {
      $beforeProcessing = ["Pre-bounce"];
    });

    this.beforeProcessing(async function (this: BouncingCallbackMailbox) {
      await this.bounceWith(bounceMailer.bounce({ to: (await this.mail()).from() }));
      ($beforeProcessing as string[]).push("Bounce");
    });

    this.beforeProcessing(() => {
      ($beforeProcessing as string[]).push("Post-bounce");
    });

    this.afterProcessing(() => {
      $afterProcessing = true;
    });
  }

  process(): void {
    $processed = true;
  }
}

class DiscardingCallbackMailbox extends Base {
  static {
    this.beforeProcessing(() => {
      $beforeProcessing = ["Pre-discard"];
    });

    this.beforeProcessing(async function (this: DiscardingCallbackMailbox) {
      await this.deliveredBang();
      ($beforeProcessing as string[]).push("Discard");
    });

    this.beforeProcessing(() => {
      ($beforeProcessing as string[]).push("Post-discard");
    });

    this.afterProcessing(() => {
      $afterProcessing = true;
    });
  }

  process(): void {
    $processed = true;
  }
}

class CallbacksTest extends TestCase {}

describe("ActionMailbox::Base::CallbacksTest", () => {
  let inboundEmail: InboundEmail;

  beforeEach(async () => {
    $beforeProcessing = $afterProcessing = $aroundProcessing = $processed = false;
    inboundEmail = (await new CallbacksTest("callbacks").createInboundEmailFromFixture(
      "welcome.eml",
    ))!;
  });

  it("all callback types", async () => {
    await CallbackMailbox.receive(inboundEmail);
    expect($beforeProcessing).toBe("Ran that!");
    expect($afterProcessing).toBe("Ran that too!");
    expect($aroundProcessing).toBe("Ran that as well!");
  });

  it("bouncing in a callback terminates processing", async () => {
    await BouncingCallbackMailbox.receive(inboundEmail);
    expect(inboundEmail.isBounced()).toBeTruthy();
    expect($beforeProcessing).toEqual(["Pre-bounce", "Bounce"]);
    expect($processed).toBeFalsy();
    expect($afterProcessing).toBeFalsy();
  });

  it("marking the inbound email as delivered in a callback terminates processing", async () => {
    await DiscardingCallbackMailbox.receive(inboundEmail);
    expect(inboundEmail.isDelivered()).toBeTruthy();
    expect($beforeProcessing).toEqual(["Pre-discard", "Discard"]);
    expect($processed).toBeFalsy();
    expect($afterProcessing).toBeFalsy();
  });
});
