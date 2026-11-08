import { Testing } from "../rails-dom-testing/testing.js";

export function withDefaultHtmlVersion(version: string, block: () => void): void {
  const oldVersion = Testing.defaultHtmlVersion;
  try {
    Testing.defaultHtmlVersion = version;
    block();
  } finally {
    Testing.defaultHtmlVersion = oldVersion;
  }
}
