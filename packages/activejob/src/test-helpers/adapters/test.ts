import { Base } from "../../base.js";

Base.setQueueAdapter("test");
Base.queueAdapter().performEnqueuedJobs = true;
Base.queueAdapter().performEnqueuedAtJobs = true;
