"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = __dirname;
const publicDir = path.join(root, "hosted-site", "public");
const input = JSON.parse(fs.readFileSync(0, "utf8"));

if (input.kind === "site") {
  const context = vm.createContext({});
  context.window = context;
  const renderer = fs.readFileSync(path.join(publicDir, "site-renderer.js"), "utf8");
  const logo = "data:image/png;base64," + fs.readFileSync(path.join(publicDir, "brand.png")).toString("base64");
  vm.runInContext(renderer, context);
  process.stdout.write(context.window.SiteRenderer.render(input.items, {
    theme: input.theme, logo, portrait: input.portrait, focus: input.focus, draft: false, workbench: true
  }));
} else if (input.kind === "card") {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(publicDir, "card-logo.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(publicDir, "card-engine.js"), "utf8"), context);
  process.stdout.write(context.CardEngine.svg(input.template, input.side, input.data, {workbench: true}));
}
