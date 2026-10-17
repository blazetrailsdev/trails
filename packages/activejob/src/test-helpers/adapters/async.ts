import { Base } from "../../base.js";

Base.setQueueAdapter("async");
Base.queueAdapter().immediate = true;
