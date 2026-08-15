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
  ["/tree-sitter-logrotate-state.wasm", [resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"), "tree-sitter-logrotate-state.wasm"), "application/wasm"]],
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
    const stateLanguage = await Language.load("/tree-sitter-logrotate-state.wasm");
    const parser = new Parser();
    parser.setLanguage(language);
    const source = "/var/log/browser.log {\\n  postrotate\\n    globalThis.__logrotateScriptExecuted = true\\n  endscript\\n}\\n";
    const tree = parser.parse(source);
    const stateParser = new Parser();
    stateParser.setLanguage(stateLanguage);
    const stateTree = stateParser.parse('logrotate state -- version 2\\n"/var/log/browser.log" 2026-8-14-12:30:45\\n');
    const rotationBlock = tree.rootNode.namedChild(0);
    const stateHeader = stateTree.rootNode.namedChild(0);
    const stateRecord = stateTree.rootNode.namedChild(1);
    const stateTimestamp = stateRecord.childForFieldName("timestamp");
    const result = {
      hasError: tree.rootNode.hasError,
      rootType: tree.rootNode.type,
      rotationBlocks: tree.rootNode.descendantsOfType("rotation_block").length,
      rotationPath: rotationBlock.childForFieldName("paths")?.text,
      scriptBodies: tree.rootNode.descendantsOfType("script_body").length,
      scriptBody: tree.rootNode.descendantsOfType("script_body")[0]?.text,
      scriptExecuted: globalThis.__logrotateScriptExecuted === true,
      stateHasError: stateTree.rootNode.hasError,
      stateRootType: stateTree.rootNode.type,
      stateChildren: stateTree.rootNode.namedChildren.map(({ type }) => type),
      stateKeyword: stateHeader.childForFieldName("keyword")?.text,
      stateVersion: stateHeader.childForFieldName("version")?.text,
      statePath: stateRecord.childForFieldName("path")?.text,
      stateTimestamp: stateTimestamp?.text,
      stateTimestampParts: ["year", "month", "day", "hour", "minute", "second"].map(
        (field) => stateTimestamp?.childForFieldName(field)?.text,
      ),
    };
    document.querySelector("#result").textContent = JSON.stringify(result);
    document.body.dataset.status = "passed";
    tree.delete();
    stateTree.delete();
    parser.delete();
    stateParser.delete();
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
    rotationPath: "/var/log/browser.log",
    scriptBodies: 1,
    scriptBody: "    globalThis.__logrotateScriptExecuted = true\n",
    scriptExecuted: false,
    stateHasError: false,
    stateRootType: "source_file",
    stateChildren: ["header", "record"],
    stateKeyword: "logrotate state -- version",
    stateVersion: "2",
    statePath: '"/var/log/browser.log"',
    stateTimestamp: "2026-8-14-12:30:45",
    stateTimestampParts: ["2026", "8", "14", "12", "30", "45"],
  });
  process.stdout.write("Chromium parsed logrotate configuration and state files with the WASM artifacts.\n");
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
