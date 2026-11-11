import { Base } from "../../lib/base.js";
import type { TestAdapter } from "../../lib/queue-adapters/test-adapter.js";

Base.queueAdapter = "test";
(Base.queueAdapter as TestAdapter).performEnqueuedJobs = true;
(Base.queueAdapter as TestAdapter).performEnqueuedAtJobs = true;
