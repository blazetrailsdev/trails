import { ActiveSupport } from "@blazetrails/activesupport/namespaces";
import { Store } from "../../store.js";

ActiveSupport.Cache.SolidCacheStore = Store;
