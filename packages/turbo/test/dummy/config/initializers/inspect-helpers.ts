import { ActionController } from "@blazetrails/actionpack";
import { rbGvSet, rbModAncestors } from "@blazetrails/ruby-compat";

rbGvSet("$dummy_ac_base_ancestors_in_initializers", rbModAncestors(ActionController.Base));
rbGvSet("$dummy_ac_base_helpers_in_initializers", rbModAncestors(ActionController.Base._helpers));
