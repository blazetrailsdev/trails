import { Base } from "../../base.js";
import type { TestAdapter } from "../../queue-adapters/test-adapter.js";

Base.setQueueAdapter("test");
(Base.queueAdapter as TestAdapter).performEnqueuedJobs = true;
(Base.queueAdapter as TestAdapter).performEnqueuedAtJobs = true;
