import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  assertEqual,
  assertNotNil,
  assertNothingRaised,
  include,
  Notifications,
} from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";

let tmpDir: string;
let testFilePath: string;
const testFileData = "Hello, world! This is test file data.\n";

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sendfile-"));
  testFilePath = path.join(tmpDir, "send_file_test.txt");
  fs.writeFileSync(testFilePath, testFileData);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeRequest(opts: Record<string, unknown> = {}): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    HTTP_HOST: "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

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
    this.layout("layouts/standard");

    this.beforeAction("file", { only: "file_from_before_action" });
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

  async data() {
    await this.sendData(this.fileData(), this.options);
  }
}

describe("SendFileTest", () => {
  class SendFileTest extends TestCase {
    declare controller: SendFileController;
    declare filePath: typeof TestFileUtils.filePath;

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
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { stream: false } as any);
      }
    }
    const c = new C();
    const response = makeResponse();
    await c.dispatch("file", makeRequest(), response);
    expect(response.body).toBe(testFileData);
  });

  it("file stream", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath);
      }
    }
    const c = new C();
    const response = makeResponse();
    await c.dispatch("file", makeRequest(), response);
    expect(response.body).toBe(testFileData);
  });

  it("file url based filename", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath);
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.headers.get("content-disposition")).toContain("attachment");
  });

  it("data", async () => {
    const fileData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28]);
    class C extends Base {
      async data() {
        await this.sendData(fileData);
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.response.bodyParts()).toEqual([fileData]);
  });

  it("headers after send shouldnt include charset", async () => {
    class C extends Base {
      async data() {
        await this.sendData(testFileData);
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
    expect(c.contentType).not.toContain("charset");
  });

  it("send file headers bang", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
    expect(c.headers.get("content-disposition")).toContain("disposition");
    expect(c.headers.get("content-disposition")).toContain("filename");
  });

  it("send file headers with disposition as a symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.headers.get("content-disposition")).toContain("disposition");
    expect(c.headers.get("content-disposition")).toContain("filename");
  });

  it("send file headers with mime lookup with symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", { type: "image/png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });

  it("send file headers with bad symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", { type: "application/octet-stream" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers with nil content type", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo");
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers guess type from extension", async () => {
    const expectations: Record<string, string> = {
      "image.png": "image/png",
      "image.jpeg": "image/jpeg",
      "image.jpg": "image/jpeg",
      "image.gif": "image/gif",
      "file.zip": "application/zip",
      "file.unk": "application/octet-stream",
      zip: "application/octet-stream",
    };

    for (const [filename, expectedType] of Object.entries(expectations)) {
      class C extends Base {
        async action() {
          await this.sendData("foo", { filename });
        }
      }
      const c = new C();
      await c.dispatch("action", makeRequest(), makeResponse());
      expect(c.contentType).toBe(expectedType);
    }
  });

  it("send file with default content disposition header", async () => {
    class C extends Base {
      async data() {
        await this.sendData(testFileData, { filename: "test.dat" });
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.headers.get("content-disposition")).toContain("attachment");
  });

  it("send file without content disposition header", async () => {
    class C extends Base {
      async data() {
        await this.sendData(testFileData, { disposition: null });
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.headers.get("content-disposition")).toBeUndefined();
  });

  it("send file from before action", async () => {
    class C extends Base {
      async fileFromBeforeAction() {
        throw new Error("No file sent from before action.");
      }
    }
    C.beforeAction((controller) => {
      (controller as Base).sendFile(testFilePath);
    });

    const c = new C();
    const response = makeResponse();
    await c.dispatch("file_from_before_action", makeRequest(), response);
    expect(response.body).toBe(testFileData);
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
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { type: "application/x-ruby" });
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.status).toBe(200);
  });

  it("send file charset with type options key", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { type: "text/calendar; charset=utf-8" });
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.contentType).toBe("text/calendar; charset=utf-8");
  });

  it("send file charset with type options key without charset", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { type: "image/png" });
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });

  it("send file charset with content type options key", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { type: "text/calendar" });
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.contentType).toBe("text/calendar");
  });
});

describe("SendFileController", () => {
  it("send file headers bang", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
    expect(c.headers.get("content-disposition")).toContain("disposition");
    expect(c.headers.get("content-disposition")).toContain("filename");
  });

  it("send file headers with disposition as a symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.headers.get("content-disposition")).toContain("disposition");
  });

  it("send file headers with mime lookup with symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", { type: "image/png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });

  it("send file headers with bad symbol", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", { type: "application/octet-stream" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers with nil content type", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo");
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers guess type from extension", async () => {
    class C extends Base {
      async action() {
        await this.sendData("foo", { filename: "image.png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });
});
