import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const files = new Map([
  ["/web-tree-sitter.js", [resolve(root, "node_modules/web-tree-sitter/web-tree-sitter.js"), "text/javascript"]],
  ["/web-tree-sitter.wasm", [resolve(root, "node_modules/web-tree-sitter/web-tree-sitter.wasm"), "application/wasm"]],
  ["/tree-sitter-logrotate.wasm", [resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "tree-sitter-logrotate.wasm"), "application/wasm"]],
]);

const pageSource = `<!doctype html>
<meta charset="utf-8">
<title>tree-sitter-logrotate browser smoke test</title>
<output id="result">starting</output>
<script type="module">
  import { Language, Parser } from "/web-tree-sitter.js";
  try {
    await Parser.init({ locateFile: () => "/web-tree-sitter.wasm" });
    const language = await Language.load("/tree-sitter-logrotate.wasm");
    const parser = new Parser();
    parser.setLanguage(language);
    const source = "/var/log/browser.log {\\n  postrotate\\n    globalThis.__logrotateScriptExecuted = true\\n  endscript\\n}\\n";
    const tree = parser.parse(source);
    const result = {
      hasError: tree.rootNode.hasError,
      rootType: tree.rootNode.type,
      rotationBlocks: tree.rootNode.descendantsOfType("rotation_block").length,
      scriptBodies: tree.rootNode.descendantsOfType("script_body").length,
      scriptExecuted: globalThis.__logrotateScriptExecuted === true,
    };
    document.querySelector("#result").textContent = JSON.stringify(result);
    document.body.dataset.status = "passed";
    tree.delete();
    parser.delete();
  } catch (error) {
    document.querySelector("#result").textContent = String(error?.stack ?? error);
    document.body.dataset.status = "failed";
  }
</script>`;

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(pageSource);
      return;
    }
    const file = files.get(pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": file[1] });
    response.end(await readFile(file[0]));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
assert.ok(address && typeof address === "object");

let browser;
try {
  const configuredExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const systemExecutable = process.platform === "linux" && existsSync("/usr/bin/chromium")
    ? "/usr/bin/chromium"
    : undefined;
  browser = await chromium.launch({
    headless: true,
    executablePath: configuredExecutable ?? systemExecutable,
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${String(address.port)}/`);
  await page.locator("body[data-status]").waitFor();
  assert.equal(await page.locator("body").getAttribute("data-status"), "passed");
  const result = JSON.parse(await page.locator("#result").textContent());
  assert.deepEqual(result, {
    hasError: false,
    rootType: "source_file",
    rotationBlocks: 1,
    scriptBodies: 1,
    scriptExecuted: false,
  });
  process.stdout.write("Chromium parsed a real logrotate configuration with the WASM artifact.\n");
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
