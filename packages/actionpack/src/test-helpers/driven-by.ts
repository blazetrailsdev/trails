import { SystemTestCase } from "../action-dispatch/system-test-case.js";

export class DrivenByRackTest extends SystemTestCase {
  static {
    this.drivenBy("rack_test");
  }
}

export class DrivenBySeleniumWithChrome extends SystemTestCase {
  static {
    this.drivenBy("selenium", { using: "chrome" });
  }
}

export class DrivenBySeleniumWithHeadlessChrome extends SystemTestCase {
  static {
    this.drivenBy("selenium", { using: "headless_chrome" });
  }
}

export class DrivenBySeleniumWithHeadlessFirefox extends SystemTestCase {
  static {
    this.drivenBy("selenium", { using: "headless_firefox" });
  }
}
