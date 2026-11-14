import { describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import { TestAdapter } from "@blazetrails/activejob/queue-adapters/test-adapter";
import "../support/test-helper.js";
import { InboundEmail } from "../../lib/inbound-email.js";
import { RoutingJob } from "../../lib/routing-job.js";

describe("ActionMailbox dummy app", () => {
  it("copies config.active_record.table_name_prefix and suffix onto Base", () => {
    expect(Base.tableNamePrefix).toBe("prefix_");
    expect(Base.tableNameSuffix).toBe("_suffix");
    expect(InboundEmail.tableName).toBe("prefix_action_mailbox_inbound_emails_suffix");
  });

  it("enqueues jobs on the test adapter", () => {
    expect(RoutingJob.queueAdapter).toBeInstanceOf(TestAdapter);
  });
});
