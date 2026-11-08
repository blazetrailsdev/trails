import { Base } from "../../base.js";
import type { AsyncAdapter } from "../../queue-adapters/async-adapter.js";

Base.setQueueAdapter("async");
(Base.queueAdapter as AsyncAdapter).immediate = true;
