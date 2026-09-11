import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogSubscriber as BaseLogSubscriber, Notifications } from "@blazetrails/activesupport";
import { Parameters } from "../../metal/strong-parameters.js";
import { LogSubscriber } from "../../log-subscriber.js";

describe("LogOnUnpermittedParamsTest", () => {
  let log: string[];

  beforeEach(() => {
    Parameters.actionOnUnpermittedParameters = "log";
  });

  afterEach(() => {
    Parameters.actionOnUnpermittedParameters = false;
    vi.restoreAllMocks();
    Notifications.unsubscribeAll();
  });

  function assertLogged(message: string, block: () => void): void {
    log = [];
    const push = (msg?: string | (() => string)) => {
      log.push(typeof msg === "function" ? msg() : (msg ?? ""));
      return true;
    };
    const logger = { "debug?": true, debug: push, info: push, warn: push, error: push };
    vi.spyOn(BaseLogSubscriber, "logger", "get").mockReturnValue(logger as never);
    Notifications.unsubscribeAll();
    LogSubscriber.attachTo("action_controller");
    block();
    expect(log.join("\n")).toContain(message);
  }

  it("logs on unexpected param", () => {
    const requestParams = { book: { pages: 65 }, fishing: "Turnips" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :fishing. Context: { action: my_action, controller: my_controller }",
      () => {
        params.permit({ book: ["pages"] });
      },
    );
  });

  it("logs on unexpected params", () => {
    const requestParams = { book: { pages: 65 }, fishing: "Turnips", car: "Mercedes" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car. Context: { action: my_action, controller: my_controller }",
      () => {
        params.permit({ book: ["pages"] });
      },
    );
  });

  it("logs on unexpected nested param", () => {
    const requestParams = { book: { pages: 65, title: "Green Cats and where to find then." } };
    const params = new Parameters(requestParams);

    assertLogged("Unpermitted parameter: :title. Context: {  }", () => {
      params.permit({ book: ["pages"] });
    });
  });

  it("logs on unexpected nested params", () => {
    const requestParams = {
      book: { pages: 65, title: "Green Cats and where to find then.", author: "G. A. Dog" },
    };
    const params = new Parameters(requestParams);

    assertLogged("Unpermitted parameters: :title, :author. Context: {  }", () => {
      params.permit({ book: ["pages"] });
    });
  });

  it("does not log on unexpected nested params with expect", () => {
    const requestParams = {
      book: { pages: 65, title: "Green Cats and where to find then.", author: "G. A. Dog" },
    };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged("", () => {
      params.expect({ book: "pages" });
    });
  });

  it("does not log on unexpected nested params with expect!", () => {
    const requestParams = {
      book: { pages: 65, title: "Green Cats and where to find then.", author: "G. A. Dog" },
    };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged("", () => {
      params.expectBang({ book: "pages" });
    });
  });

  it("logs on unexpected param with deep_dup", () => {
    const requestParams = { book: { pages: 3, author: "YY" } };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :author. Context: { action: my_action, controller: my_controller }",
      () => {
        params.deepDup().permit({ book: ["pages"] });
      },
    );
  });

  it("logs on unexpected params with slice", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car. Context: { action: my_action, controller: my_controller }",
      () => {
        params.slice("food", "fishing", "car").permit("food");
      },
    );
  });

  it("logs on unexpected params with except", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car. Context: { action: my_action, controller: my_controller }",
      () => {
        params.except("music").permit("food");
      },
    );
  });

  it("logs on unexpected params with transform_values", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car, :music. Context: { action: my_action, controller: my_controller }",
      () => {
        params.transformValues((v) => String(v).toUpperCase()).permit("food");
      },
    );
  });

  it("logs on unexpected params with transform_keys", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :FISHING, :CAR, :MUSIC. Context: { action: my_action, controller: my_controller }",
      () => {
        params.transformKeys((k) => k.toUpperCase()).permit("FOOD");
      },
    );
  });

  it("logs on unexpected param with deep_transform_keys", () => {
    const requestParams = { book: { pages: 48, title: "Hope" } };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :TITLE. Context: { action: my_action, controller: my_controller }",
      () => {
        params.deepTransformKeys((k) => k.toUpperCase()).permit({ BOOK: ["PAGES"] });
      },
    );
  });

  it("logs on unexpected param with select", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :music. Context: { action: my_action, controller: my_controller }",
      () => {
        params.select((k) => k === "music").permit("food");
      },
    );
  });

  it("logs on unexpected params with reject", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car. Context: { action: my_action, controller: my_controller }",
      () => {
        params.reject((k) => k === "music").permit("food");
      },
    );
  });

  it("logs on unexpected param with compact", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: null, music: null };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :fishing. Context: { action: my_action, controller: my_controller }",
      () => {
        params.compact().permit("food");
      },
    );
  });

  it("logs on unexpected param with merge", () => {
    const requestParams = { food: "tomato" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :album. Context: { action: my_action, controller: my_controller }",
      () => {
        params.merge({ album: "My favorites" }).permit("food");
      },
    );
  });

  it("logs on unexpected param with reverse_merge", () => {
    const requestParams = { food: "tomato" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameter: :album. Context: { action: my_action, controller: my_controller }",
      () => {
        params.reverseMerge({ album: "My favorites" }).permit("food");
      },
    );
  });

  it("logs on unexpected params with extract!", () => {
    const requestParams = { food: "tomato", fishing: "Turnips", car: "Mercedes", music: "No. 9" };
    const context = { action: "my_action", controller: "my_controller" };
    const params = new Parameters(requestParams, context);

    assertLogged(
      "Unpermitted parameters: :fishing, :car. Context: { action: my_action, controller: my_controller }",
      () => {
        params.extractBang("food", "fishing", "car").permit("food");
      },
    );

    assertLogged(
      "Unpermitted parameter: :music. Context: { action: my_action, controller: my_controller }",
      () => {
        params.permit("food");
      },
    );
  });
});
