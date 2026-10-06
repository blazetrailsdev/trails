import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = __dirname;
const RUBY_SCRIPT = path.join(HERE, "extract-ruby-tests.rb");

function extract(source: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "controller-actions-rb-"));
  try {
    const rel = "controller/foo_test.rb";
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, source);
    const driver = `
      require_relative ${JSON.stringify(RUBY_SCRIPT)}
      require "json"
      ex = TestExtractor.new
      ex.process_file(File.join(${JSON.stringify(dir)}, ${JSON.stringify(rel)}), ${JSON.stringify(dir)})
      puts JSON.generate(ex.test_files.flat_map { |f| f[:testCases] }.map { |tc| tc[:path] })
    `;
    return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Ruby extractor controller actions named test_*", () => {
  it("skips def test_* in a class whose superclass is a controller base", () => {
    // actionpack/test/controller/render_test.rb:977-1008
    expect(
      extract(`
        class LiveTestController < ActionController::Base
          def test_action
            head :ok
          end
        end

        class LiveHeadRenderTest < ActionController::TestCase
          def test_live_head_ok
            pass
          end
        end
      `),
    ).toEqual(["LiveHeadRenderTest > live head ok"]);
  });

  it("skips a nested controller and a subclass of a same-file controller", () => {
    // actionpack/test/controller/integration_test.rb:1275-1280
    expect(
      extract(`
        class ApiController < ActionController::API
          def test_api
          end
        end

        class ChildController < ApiController
          def test_child
          end
        end

        class UploadTest < ActionDispatch::IntegrationTest
          class IntegrationController < ::ApplicationController
            def test_file_upload
            end
          end

          def test_upload
          end
        end
      `),
    ).toEqual(["UploadTest > upload"]);
  });

  it("decides by superclass, not by a Controller name suffix", () => {
    // actionpack/test/dispatch/routing_test.rb:5023
    expect(
      extract(`
        class TestErrorsInController < ActionDispatch::IntegrationTest
          def test_legit_routes_are_not_swallowed
          end
        end
      `),
    ).toEqual(["TestErrorsInController > legit routes are not swallowed"]);
  });
});
