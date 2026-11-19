---
title: Packages
description: Every published @blazetrails package, its Rails counterpart, and its parity figures.
---

<script setup>
import { withBase } from "vitepress";
import { data } from "./packages.data.ts";
</script>

# Packages

One page per published package: its Rails counterpart, the share of Rails
methods and tests it matches, and the deviations from Rails ratified for it.
Figures are measured by CI's `parity:api` and `parity:test` gates at commit
`{{ data.measuredAt }}`; "—" means no measurement was available to this build.

<table>
  <thead>
    <tr><th>Package</th><th>Rails counterpart</th><th>API methods</th><th>Rails tests</th></tr>
  </thead>
  <tbody>
    <tr v-for="p in data.packages" :key="p.name">
      <td><a :href="withBase(`/packages/${p.name}`)">{{ p.name }}</a></td>
      <td><code>{{ p.railsCounterpart }}</code></td>
      <td>{{ p.api }}</td>
      <td>{{ p.tests }}</td>
    </tr>
  </tbody>
</table>
