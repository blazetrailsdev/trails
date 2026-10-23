import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const RUBY_SCRIPT = path.join(__dirname, "extract-ruby-tests.rb");

function select(pkg: string, files: string[]): string[] {
  const driver = `
    require_relative ${JSON.stringify(RUBY_SCRIPT)}
    require "json"
    files = ${JSON.stringify(files)}.map { |f| File.join("/t", f) }
    puts JSON.generate(select_package_test_files!(${JSON.stringify(pkg)}, "/t", files))
  `;
  return JSON.parse(execFileSync("ruby", ["-e", driver], { encoding: "utf-8" }));
}

describe("extract-ruby-tests package selection", () => {
  const files = [
    "abstract/callbacks_test.rb",
    "abstract_unit_test.rb",
    "controller/render_test.rb",
    "dispatch/request_test.rb",
  ];

  it("leaves abstract/ and controller/ out of actiondispatch", () => {
    expect(select("actiondispatch", files)).toEqual([
      "/t/abstract_unit_test.rb",
      "/t/dispatch/request_test.rb",
    ]);
  });

  it("keeps only controller/ for actioncontroller", () => {
    expect(select("actioncontroller", files)).toEqual(["/t/controller/render_test.rb"]);
  });
});
