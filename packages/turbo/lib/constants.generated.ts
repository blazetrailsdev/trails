import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./app/channels/turbo/streams-channel.js";
import * as m1 from "./app/controllers/turbo/native/navigation-controller.js";
import * as m2 from "./app/controllers/turbo/native/navigation.js";
import * as m3 from "./app/jobs/turbo/streams/action-broadcast-job.js";
import * as m4 from "./app/jobs/turbo/streams/broadcast-job.js";
import * as m5 from "./app/jobs/turbo/streams/broadcast-stream-job.js";
import * as m6 from "./app/models/concerns/turbo/broadcastable.js";
import * as m7 from "./app/models/turbo/debouncer.js";
import * as m8 from "./app/models/turbo/immediate-debouncer.js";
import * as m9 from "./app/models/turbo/streams/tag-builder.js";
import * as m10 from "./app/models/turbo/thread-debouncer.js";
import * as m11 from "./engine.js";

defineConstants([
  [m2, "Navigation", "App::Controllers::Turbo::Native::Navigation"],
  [m1, "NavigationController", "App::Controllers::Turbo::Native::NavigationController"],
  [m6, "Broadcastable", "App::Models::Concerns::Turbo::Broadcastable"],
  [m6, "ClassMethods", "App::Models::Concerns::Turbo::Broadcastable::ClassMethods"],
  [m7, "Debouncer", "App::Models::Turbo::Debouncer"],
  [m8, "ImmediateDebouncer", "App::Models::Turbo::ImmediateDebouncer"],
  [m9, "TagBuilder", "App::Models::Turbo::Streams::TagBuilder"],
  [m10, "ThreadDebouncer", "App::Models::Turbo::ThreadDebouncer"],
  [m11, "Engine", "Engine"],
  [m3, "ActionBroadcastJob", "Turbo::Streams::ActionBroadcastJob"],
  [m4, "BroadcastJob", "Turbo::Streams::BroadcastJob"],
  [m5, "BroadcastStreamJob", "Turbo::Streams::BroadcastStreamJob"],
  [m0, "StreamsChannel", "Turbo::StreamsChannel"],
]);
