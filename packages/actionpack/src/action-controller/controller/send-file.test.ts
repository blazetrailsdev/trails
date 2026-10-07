import { describe, it, beforeEach } from "vitest";
import {
  assertEqual,
  assertKindOf,
  assertNil,
  assertNotNil,
  assertNothingRaised,
  assertRaise,
  assertRespondTo,
  include,
  Notifications,
} from "@blazetrails/activesupport";
import { ArgumentError, File, StringIO } from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { Live } from "../metal/live.js";
import { Testing } from "../metal/testing.js";
import { type LiveTestResponse, TestCase } from "../test-case.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import type { TestResponse } from "../../action-dispatch/testing/test-response.js";

const TestFileUtils = {
  fileName(): string {
    return File.basename(new URL(import.meta.url).pathname);
  },
  filePath(): string {
    return new URL(import.meta.url).pathname;
  },
  fileData(this: { _data?: string; filePath(): string }): string {
    return (this._data ||= File.binread(this.filePath()));
  },
};

class SendFileController extends Base {
  declare _data?: string;
  declare fileName: typeof TestFileUtils.fileName;
  declare filePath: typeof TestFileUtils.filePath;
  declare fileData: typeof TestFileUtils.fileData;

  static {
    include(this, TestFileUtils);
    include(this, Testing);
    this.layout("layouts/standard");

    this.beforeAction("file", { only: "fileFromBeforeAction" });
  }

  declare _options?: Record<string, unknown>;
  set options(options: Record<string, unknown>) {
    this._options = options;
  }
  get options(): Record<string, unknown> {
    return (this._options ||= {});
  }

  file() {
    this.sendFile(this.filePath(), this.options);
  }

  fileFromBeforeAction() {
    throw new Error("No file sent from before action.");
  }

  async testSendFileHeadersBang() {
    const options = {
      type: Mime.get("png"),
      disposition: "disposition",
      filename: "filename",
    };

    await this.sendData("foo", options);
  }

  async testSendFileHeadersWithDispositionAsASymbol() {
    const options = {
      type: Mime.get("png"),
      disposition: "disposition",
      filename: "filename",
    };

    await this.sendData("foo", options);
  }

  async testSendFileHeadersWithMimeLookupWithSymbol() {
    const options = { type: ":png" };

    await this.sendData("foo", options);
  }

  async testSendFileHeadersWithBadSymbol() {
    const options = { type: ":this_type_is_not_registered" };
    await this.sendData("foo", options);
  }

  async testSendFileHeadersWithNilContentType() {
    const options = { type: null };
    await this.sendData("foo", options);
  }

  async testSendFileHeadersGuessTypeFromExtension() {
    const options = { filename: this.params.get("filename") as string };
    await this.sendData("foo", options);
  }

  async data() {
    await this.sendData(this.fileData(), this.options);
  }
}

class SendFileWithActionControllerLive extends SendFileController {
  static {
    include(this, Live);
  }
}

describe("SendFileTest", () => {
  class SendFileTest extends TestCase {
    declare controller: SendFileController;
    declare filePath: typeof TestFileUtils.filePath;
    declare fileData: typeof TestFileUtils.fileData;
    declare _data?: string;

    static {
      include(this, TestFileUtils);
    }

    override setup() {
      this.controller = new SendFileController();
    }
  }

  let tc: SendFileTest;

  beforeEach(async ({ task }) => {
    tc = new SendFileTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("file nostream", async () => {
    tc.controller.options = { stream: false };
    let response: LiveTestResponse | TestResponse | null = null;
    await assertNothingRaised(async () => {
      response = await tc.process("file");
    });
    assertNotNil(response);
    const body = response!.body;
    assertKindOf(String, body);
    assertEqual(tc.fileData(), body);
  });

  it("file stream", async () => {
    let response: LiveTestResponse | TestResponse | null = null;
    await assertNothingRaised(async () => {
      response = await tc.process("file");
    });
    assertNotNil(response);
    assertRespondTo(response!.stream, "each");
    assertRespondTo(response!.stream, "toPath");

    const output = new StringIO();
    output.binmode();
    for (const part of response!.bodyParts()) output.write(String(part));
    assertEqual(tc.fileData(), output.string());
  });

  it("file url based filename", async () => {
    tc.controller.options = { urlBasedFilename: true };
    let response: LiveTestResponse | TestResponse | null = null;
    await assertNothingRaised(async () => {
      response = await tc.process("file");
    });
    assertNotNil(response);
    assertEqual("attachment", response!.headers.get("Content-Disposition"));
  });

  it("data", async () => {
    let response: LiveTestResponse | TestResponse | null = null;
    await assertNothingRaised(async () => {
      response = await tc.process("data");
    });
    assertNotNil(response);

    assertKindOf(String, response!.body);
    assertEqual(tc.fileData(), response!.body);
  });

  it("headers after send shouldnt include charset", async () => {
    let response = await tc.process("data");
    assertEqual("application/octet-stream", response.headers.get("Content-Type"));

    response = await tc.process("file");
    assertEqual("application/octet-stream", response.headers.get("Content-Type"));
  });

  it("send file headers bang", async () => {
    for (let i = 0; i < 5; i++) {
      await tc.get("testSendFileHeadersBang");

      assertEqual("image/png", tc.response.contentType);
      assertEqual(
        `disposition; filename="filename"; filename*=UTF-8''filename`,
        tc.response.getHeader("Content-Disposition"),
      );
      assertEqual("binary", tc.response.getHeader("Content-Transfer-Encoding"));
    }
  });

  it("send file headers with disposition as a symbol", async () => {
    await tc.get("testSendFileHeadersWithDispositionAsASymbol");

    assertEqual(
      `disposition; filename="filename"; filename*=UTF-8''filename`,
      tc.response.getHeader("Content-Disposition"),
    );
  });

  it("send file headers with mime lookup with symbol", async () => {
    await tc.get("testSendFileHeadersWithMimeLookupWithSymbol");
    assertEqual("image/png", tc.response.contentType);
  });

  it("send file headers with bad symbol", async () => {
    const error = await assertRaise([ArgumentError], {}, async () => {
      await tc.get("testSendFileHeadersWithBadSymbol");
    });
    assertEqual("Unknown MIME type this_type_is_not_registered", error.message);
  });

  it("send file headers with nil content type", async () => {
    const error = await assertRaise([ArgumentError], {}, async () => {
      await tc.get("testSendFileHeadersWithNilContentType");
    });
    assertEqual(":type option required", error.message);
  });

  it("send file headers guess type from extension", async () => {
    for (const [filename, expectedType] of Object.entries({
      "image.png": "image/png",
      "image.jpeg": "image/jpeg",
      "image.jpg": "image/jpeg",
      "image.tif": "image/tiff",
      "image.gif": "image/gif",
      "movie.mp4": "video/mp4",
      "file.zip": "application/zip",
      "file.unk": "application/octet-stream",
      zip: "application/octet-stream",
    })) {
      await tc.get("testSendFileHeadersGuessTypeFromExtension", { params: { filename } });
      assertEqual(expectedType, tc.response.contentType);
    }
  });

  it("send file with default content disposition header", async () => {
    await tc.process("data");
    assertEqual("attachment", tc.controller.headers.get("Content-Disposition"));
  });

  it("send file without content disposition header", async () => {
    tc.controller.options = { disposition: null };
    await tc.process("data");
    assertNil(tc.controller.headers.get("Content-Disposition"));
  });

  it("send file from before action", async () => {
    let response: LiveTestResponse | TestResponse | null = null;
    await assertNothingRaised(async () => {
      response = await tc.process("fileFromBeforeAction");
    });
    assertNotNil(response);

    assertKindOf(String, response!.body);
    assertEqual(tc.fileData(), response!.body);
  });

  it("send file instrumentation", async () => {
    tc.controller.options = { disposition: "inline" };
    let payload: Record<string, unknown> | null = null;

    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    await Notifications.subscribed(subscriber, "send_file.action_controller", async () => {
      await tc.process("file");
    });

    assertEqual(tc.filePath(), payload!.path);
    assertEqual("inline", payload!.disposition);
  });

  it("send data instrumentation", async () => {
    tc.controller.options = { contentType: "application/x-ruby" };
    let payload: Record<string, unknown> | null = null;

    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    await Notifications.subscribed(subscriber, "send_data.action_controller", async () => {
      await tc.process("data");
    });

    assertEqual("application/x-ruby", payload!.contentType);
  });

  for (const method of ["file", "data"]) {
    it(`send ${method} status`, async () => {
      tc.controller.options = { stream: false, status: 500 };
      assertNotNil(await tc.process(method));
      assertEqual(500, tc.response.status);
    });

    it(`send ${method} content type`, async () => {
      tc.controller.options = { stream: false, contentType: "application/x-ruby" };
      await assertNothingRaised(async () => assertNotNil(await tc.process(method)));
      assertEqual("application/x-ruby", tc.response.contentType);
    });

    it(`default send ${method} status`, async () => {
      tc.controller.options = { stream: false };
      await assertNothingRaised(async () => assertNotNil(await tc.process(method)));
      assertEqual(200, tc.response.status);
    });
  }

  it("send file with action controller live", async () => {
    tc.controller = new SendFileWithActionControllerLive();
    tc.controller.options = { contentType: "application/x-ruby" };

    const response = await tc.process("file");
    assertEqual(200, response.status);
  });

  it("send file charset with type options key", async () => {
    tc.controller = new SendFileWithActionControllerLive();
    tc.controller.options = { type: "text/calendar; charset=utf-8" };
    const response = await tc.process("file");
    assertEqual("text/calendar; charset=utf-8", response.headers.get("Content-Type"));
  });

  it("send file charset with type options key without charset", async () => {
    tc.controller = new SendFileWithActionControllerLive();
    tc.controller.options = { type: "image/png" };
    const response = await tc.process("file");
    assertEqual("image/png", response.headers.get("Content-Type"));
  });

  it("send file charset with content type options key", async () => {
    tc.controller = new SendFileWithActionControllerLive();
    tc.controller.options = { contentType: "text/calendar" };
    const response = await tc.process("file");
    assertEqual("text/calendar", response.headers.get("Content-Type"));
  });
});
