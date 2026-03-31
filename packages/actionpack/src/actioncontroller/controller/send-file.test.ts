import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Base } from "../base.js";
import { Request } from "../../actiondispatch/request.js";
import { Response } from "../../actiondispatch/response.js";

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

// ==========================================================================
// controller/send_file_test.rb — SendFileTest
// ==========================================================================
describe("SendFileTest", () => {
  it("file nostream", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath, { stream: false } as any);
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.body).toBe(testFileData);
  });

  it("file stream", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath);
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.body).toBe(testFileData);
  });

  it("file url based filename", async () => {
    class C extends Base {
      async file() {
        this.sendFile(testFilePath);
      }
    }
    const c = new C();
    await c.dispatch("file", makeRequest(), makeResponse());
    expect(c.getHeader("content-disposition")).toContain("attachment");
  });

  it("data", async () => {
    class C extends Base {
      async data() {
        this.sendData(testFileData);
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.body).toBe(testFileData);
  });

  it("headers after send shouldnt include charset", async () => {
    class C extends Base {
      async data() {
        this.sendData(testFileData);
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
        this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
    expect(c.getHeader("content-disposition")).toContain("disposition");
    expect(c.getHeader("content-disposition")).toContain("filename");
  });

  it("send file headers with disposition as a symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.getHeader("content-disposition")).toContain("disposition");
    expect(c.getHeader("content-disposition")).toContain("filename");
  });

  it("send file headers with mime lookup with symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", { type: "image/png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });

  it("send file headers with bad symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", { type: "application/octet-stream" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers with nil content type", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo");
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
          this.sendData("foo", { filename });
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
        this.sendData(testFileData, { filename: "test.dat" });
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.getHeader("content-disposition")).toContain("attachment");
  });

  it("send file without content disposition header", async () => {
    class C extends Base {
      async data() {
        this.sendData(testFileData);
      }
    }
    const c = new C();
    await c.dispatch("data", makeRequest(), makeResponse());
    expect(c.getHeader("content-disposition")).toBeUndefined();
  });

  it("send file from before action", async () => {
    class C extends Base {
      async fileFromBeforeAction() {
        throw new Error("No file sent from before action.");
      }
    }
    C.beforeAction((controller) => {
      (controller as Base).sendFile(testFilePath);
      return false;
    });

    const c = new C();
    await c.dispatch("fileFromBeforeAction", makeRequest(), makeResponse());
    expect(c.body).toBe(testFileData);
  });

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

// ==========================================================================
// SendFileController tests (test actions that call send_data)
// ==========================================================================
describe("SendFileController", () => {
  it("send file headers bang", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
    expect(c.getHeader("content-disposition")).toContain("disposition");
    expect(c.getHeader("content-disposition")).toContain("filename");
  });

  it("send file headers with disposition as a symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", {
          type: "image/png",
          disposition: "disposition",
          filename: "filename",
        });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.getHeader("content-disposition")).toContain("disposition");
  });

  it("send file headers with mime lookup with symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", { type: "image/png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });

  it("send file headers with bad symbol", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", { type: "application/octet-stream" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers with nil content type", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo");
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("application/octet-stream");
  });

  it("send file headers guess type from extension", async () => {
    class C extends Base {
      async action() {
        this.sendData("foo", { filename: "image.png" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.contentType).toBe("image/png");
  });
});
