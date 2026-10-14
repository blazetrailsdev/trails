import { describe, it, afterEach, beforeEach } from "vitest";
import {
  Encoding,
  EOFError,
  File,
  rbObjEncoding,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { assert, assertEqual, assertNil } from "@blazetrails/activesupport";
import { Base } from "../../../action-controller/base.js";
import { controllerConstants } from "../../http/request.js";
import { deprecator } from "../../deprecator.js";
import { IntegrationTest } from "../../testing/integration.js";
import type { RouteSet } from "../../routing/route-set.js";
import "../../../test-helpers/abstract-unit.js";

interface UploadedFile {
  originalFilename: string;
  contentType: string | null;
  read(): string;
  size(): number;
}

class MultipartParamsParsingTest extends IntegrationTest {}
registerConstant("MultipartParamsParsingTest", MultipartParamsParsingTest);

describe("MultipartParamsParsingTest", () => {
  class TestController extends Base {
    static {
      this.skipParameterEncoding("parseBinary");
    }

    static lastRequestParameters: Record<string, unknown> | null = null;
    static lastParameters: Record<string, unknown> | null = null;

    async parseBinary(): Promise<void> {
      try {
        TestController.lastRequestParameters = this.request.requestParameters;
      } catch (e) {
        if (!(e instanceof EOFError)) throw e;
        TestController.lastRequestParameters = {};
      }
      TestController.lastParameters = this.request.parameters;
      await this.head(":ok");
    }

    async parse(): Promise<void> {
      try {
        TestController.lastRequestParameters = this.request.requestParameters;
      } catch (e) {
        if (!(e instanceof EOFError)) throw e;
        TestController.lastRequestParameters = {};
      }
      TestController.lastParameters = this.request.parameters;
      await this.head(":ok");
    }

    async read(): Promise<void> {
      await this.render({
        plain: `File: ${(this.params.get("uploaded_data") as UploadedFile).read()}`,
      });
    }
  }
  controllerConstants.set("multipart_params_parsing_test/test", TestController);

  const FIXTURE_PATH = File.expandPath(
    "../../../test-helpers/fixtures/multipart",
    import.meta.dirname,
  );

  let t: MultipartParamsParsingTest;
  beforeEach(({ testCase }) => {
    t = testCase as MultipartParamsParsingTest;
  });

  afterEach(() => {
    TestController.lastRequestParameters = null;
  });

  const fixture = (name: string): Record<string, string> =>
    File.open(File.join(FIXTURE_PATH, name), "rb", (file) => ({
      "rack.input": file.read(),
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      CONTENT_LENGTH: String(file.stat().size),
    }));

  const parseMultipart = async (name: string, path = "/parse"): Promise<Record<string, unknown>> =>
    withTestRouting(async () => {
      const headers = fixture(name);
      const params = headers["rack.input"];
      delete headers["rack.input"];
      await t.post(path, { params, headers });
      t.assertResponse(":ok");
      return TestController.lastRequestParameters!;
    });

  const withTestRouting = async <T>(block: () => Promise<T>): Promise<T> =>
    t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.post("/:action", { controller: "multipart_params_parsing_test/test" });
        });
      });
      return block();
    });

  it("parses single parameter", async () => {
    assertEqual({ foo: "bar" }, await parseMultipart("single_parameter"));
  });

  it("parses bracketed parameters", async () => {
    assertEqual({ foo: { baz: "bar" } }, await parseMultipart("bracketed_param"));
  });

  it("parse single utf8 parameter", async () => {
    assertEqual(
      { Iñtërnâtiônàlizætiøn_name: "Iñtërnâtiônàlizætiøn_value" },
      await parseMultipart("single_utf8_param"),
      "request.request_parameters",
    );
    assertEqual(
      "Iñtërnâtiônàlizætiøn_value",
      TestController.lastParameters!["Iñtërnâtiônàlizætiøn_name"],
      "request.parameters",
    );
  });

  it("parse bracketed utf8 parameter", async () => {
    assertEqual(
      {
        Iñtërnâtiônàlizætiøn_name: {
          Iñtërnâtiônàlizætiøn_nested_name: "Iñtërnâtiônàlizætiøn_value",
        },
      },
      await parseMultipart("bracketed_utf8_param"),
      "request.request_parameters",
    );
    assertEqual(
      { Iñtërnâtiônàlizætiøn_nested_name: "Iñtërnâtiônàlizætiøn_value" },
      TestController.lastParameters!["Iñtërnâtiônàlizætiøn_name"],
      "request.parameters",
    );
  });

  it("parses text file", async () => {
    const params = await parseMultipart("text_file");
    assertEqual(["file", "foo"], Object.keys(params).sort());
    assertEqual("bar", params["foo"]);

    const file = params["file"] as UploadedFile;
    assertEqual("file.txt", file.originalFilename);
    assertEqual("text/plain", file.contentType);
    assertEqual("contents", file.read());
  });

  it("parses utf8 filename with percent character", async () => {
    const params = await parseMultipart("utf8_filename");
    assertEqual(["file", "foo"], Object.keys(params).sort());
    assertEqual("bar", params["foo"]);

    const file = params["file"] as UploadedFile;
    assertEqual("text/plain", file.contentType);
    assertEqual("contents", file.read());
  });

  it("parses boundary problem file", async () => {
    const params = await parseMultipart("boundary_problem_file");
    assertEqual(["file", "foo"], Object.keys(params).sort());

    const file = params["file"] as UploadedFile;
    const foo = params["foo"];

    assertEqual("file.txt", file.originalFilename);
    assertEqual("text/plain", file.contentType);

    assertEqual("bar", foo);
  });

  it("parses large text file", async () => {
    const params = await parseMultipart("large_text_file");
    assertEqual(["file", "foo"], Object.keys(params).sort());
    assertEqual("bar", params["foo"]);

    const file = params["file"] as UploadedFile;

    assertEqual("file.txt", file.originalFilename);
    assertEqual("text/plain", file.contentType);
    assertEqual("a".repeat(20480), file.read());
  });

  it("parses binary file", async () => {
    const params = await parseMultipart("binary_file");
    assertEqual(["file", "flowers", "foo"], Object.keys(params).sort());
    assertEqual("bar", params["foo"]);

    let file = params["file"] as UploadedFile;
    assertEqual("file.csv", file.originalFilename);
    assertNil(file.contentType);
    assertEqual("contents", file.read());

    file = params["flowers"] as UploadedFile;
    assertEqual("flowers.jpg", file.originalFilename);
    assertEqual("image/jpeg", file.contentType);
    assertEqual(19512, file.size());
  });

  it("parses mixed files", async () => {
    const params = await parseMultipart("mixed_files", "/parseBinary");
    assertEqual(["files", "foo"], Object.keys(params).sort());
    assertEqual("bar", params["foo"]);
  });

  it("does not create tempfile if no file has been selected", async () => {
    const params = await parseMultipart("none");
    assertEqual(["submit-name"], Object.keys(params).sort());
    assertEqual("Larry", params["submit-name"]);
    assertNil(params["files"]);
  });

  it("parses empty upload file", async () => {
    const params = await parseMultipart("empty");
    assertEqual(["files", "submit-name"], Object.keys(params).sort());
    assertEqual("Larry", params["submit-name"]);
    assert(params["files"]);
    assertEqual("", (params["files"] as UploadedFile).read());
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — a JS response body has no ASCII-8BIT tag to assert.
  it.skip("uploads and reads binary file", async () => {
    await withTestRouting(async () => {
      const fixture = FIXTURE_PATH + "/ruby_on_rails.jpg";
      const params = { uploaded_data: t.fixtureFileUpload(fixture, "image/jpeg") };
      await t.post("/read", { params });
      assertEqual(Encoding.ASCII_8BIT, rbObjEncoding(t.response.body));
    });
  });

  it("uploads and reads file", async () => {
    await withTestRouting(async () => {
      await t.post("/read", {
        params: { uploaded_data: t.fixtureFileUpload(FIXTURE_PATH + "/hello.txt", "text/plain") },
      });
      assertEqual("File: Hello", t.response.body);
    });
  });

  it("does not raise EOFError on GET request with multipart content-type", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get("/:action", { controller: "multipart_params_parsing_test/test" });
        });
      });
      const headers = { CONTENT_TYPE: "multipart/form-data; boundary=AaB03x" };
      await t.get("/parse", { headers });
      t.assertResponse(":ok");
    });
  });
});
