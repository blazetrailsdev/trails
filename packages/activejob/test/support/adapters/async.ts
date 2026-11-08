import { Base } from "../../../lib/base.js";
import type { AsyncAdapter } from "../../../lib/queue-adapters/async-adapter.js";

Base.setQueueAdapter("async");
(Base.queueAdapter as AsyncAdapter).immediate = true;
