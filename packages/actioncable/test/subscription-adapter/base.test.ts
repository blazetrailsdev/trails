import { NotImplementedError } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../support/test-helper.js";
import { TestServer } from "../support/stubs/test-server.js";
import { SuccessAdapter } from "../support/stubs/test-adapter.js";
import { Base } from "../../lib/subscription-adapter/base.js";

describe("ActionCable::SubscriptionAdapter::BaseTest", () => {
  class BrokenAdapter extends Base {}

  let server: TestServer;

  beforeEach(() => {
    server = new TestServer();
    server.config.subscriptionAdapter = BrokenAdapter;
    server.config.allowedRequestOrigins = ["http://rubyonrails.com"];
  });

  it("#broadcast returns NotImplementedError by default", async () => {
    await expect(new BrokenAdapter(server).broadcast("channel", "payload")).rejects.toThrow(
      NotImplementedError,
    );
  });

  it("#subscribe returns NotImplementedError by default", async () => {
    const callback = () => console.log("callback");
    const successCallback = () => console.log("success");

    await expect(
      new BrokenAdapter(server).subscribe("channel", callback, successCallback),
    ).rejects.toThrow(NotImplementedError);
  });

  it("#unsubscribe returns NotImplementedError by default", async () => {
    const callback = () => console.log("callback");

    await expect(new BrokenAdapter(server).unsubscribe("channel", callback)).rejects.toThrow(
      NotImplementedError,
    );
  });

  it("#broadcast is implemented", async () => {
    await expect(new SuccessAdapter(server).broadcast("channel", "payload")).resolves.not.toThrow();
  });

  it("#subscribe is implemented", async () => {
    const callback = () => console.log("callback");
    const successCallback = () => console.log("success");

    await expect(
      new SuccessAdapter(server).subscribe("channel", callback, successCallback),
    ).resolves.not.toThrow();
  });

  it("#unsubscribe is implemented", async () => {
    const callback = () => console.log("callback");

    await expect(
      new SuccessAdapter(server).unsubscribe("channel", callback),
    ).resolves.not.toThrow();
  });
});
