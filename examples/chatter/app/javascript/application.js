import "@hotwired/turbo-rails";
import { Application } from "@hotwired/stimulus";
import ComposerController from "./controllers/composer-controller.js";
import ScrollController from "./controllers/scroll-controller.js";
import ThreadController from "./controllers/thread-controller.js";
import LocalTimeController from "./controllers/local-time-controller.js";
import "../assets/stylesheets/application.css";

const application = Application.start();
application.register("composer", ComposerController);
application.register("scroll", ScrollController);
application.register("thread", ThreadController);
application.register("local-time", LocalTimeController);
