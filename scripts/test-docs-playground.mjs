import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distributionRoot = resolve(repositoryRoot, "docs-site/dist");
const basePath = "/tree-sitter-logrotate";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".xml", "application/xml; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://127.0.0.1").pathname,
    );
    if (!pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end();
      return;
    }
    const relativePath = pathname.slice(basePath.length + 1);
    const requestedPath = resolve(
      distributionRoot,
      relativePath === "" || relativePath.endsWith("/")
        ? `${relativePath}index.html`
        : relativePath,
    );
    if (
      requestedPath !== distributionRoot &&
      !requestedPath.startsWith(`${distributionRoot}${sep}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (!(await stat(requestedPath)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes.get(extname(requestedPath)) ?? "application/octet-stream",
    });
    response.end(await readFile(requestedPath));
  } catch (error) {
    if (error?.code === "ENOENT") {
      response.writeHead(404).end();
      return;
    }
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
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(
    `http://127.0.0.1:${String(address.port)}${basePath}/playground/`,
  );
  const playground = page.locator("[data-logrotate-playground]");
  const source = page.locator("[data-editor] .cm-content");
  const sourceValue = page.locator("[data-source-value]");
  const tree = page.locator("[data-tree]");
  const summary = page.locator("[data-result-summary]");
  const completion = page.locator(".cm-tooltip-autocomplete");
  const completionLabels = () => completion.locator(".cm-completionLabel").allTextContents();
  const readSource = () => sourceValue.textContent();
  const replaceSource = async (value) => {
    await source.fill(value);
    await page.waitForFunction((expected) =>
      document.querySelector("[data-source-value]")?.textContent === expected,
    value);
  };
  await playground.locator("[data-runtime-status]").getByText("Browser parser ready").waitFor();

  assert.equal(await playground.getAttribute("data-status"), "ready");
  assert.equal(await playground.getAttribute("data-result"), "valid");
  assert.match(await readSource(), /postrotate/u);
  assert.equal(await source.getAttribute("contenteditable"), "true");
  assert.equal(await page.locator("[data-editor] .cm-lineNumbers").count(), 1);
  assert.match(await tree.textContent(), /paths: path_list/u);
  assert.match(await tree.textContent(), /script_body/u);
  assert.ok(await page.locator('[data-editor] [data-capture="keyword"]').count() > 5);
  assert.ok(await page.locator('[data-editor] [data-capture="string.special.path"]').count() > 0);
  assert.match(
    await page.locator('[data-editor] [data-capture="function"]').allTextContents().then((texts) => texts.join(" ")),
    /systemctl/u,
  );
  assert.match(
    await page.locator('[data-editor] [data-capture="operator"]').allTextContents().then((texts) => texts.join("")),
    />/u,
  );

  const examplePicker = playground.locator("[data-example]");
  for (const [index, expectedResult] of ["valid", "valid", "valid", "issues"].entries()) {
    await examplePicker.selectOption(String(index));
    assert.equal(
      await playground.getAttribute("data-result"),
      expectedResult,
      `configuration example ${String(index + 1)}`,
    );
  }
  await examplePicker.selectOption("0");

  const everyScriptDirective = `/var/log/café.log {
  firstaction
    echo first
  endscript
  prerotate
    if test -n "$ready"; then
      echo before
    fi
  endscript
  postrotate
    echo after
  endscript
  lastaction
    echo last
  endscript
  preremove
    echo remove
  endscript
}
`;
  await replaceSource(everyScriptDirective);
  await page.waitForFunction(() =>
    document.querySelector("[data-tree]")?.textContent?.includes("preremove"),
  );
  assert.equal(await playground.getAttribute("data-result"), "valid");
  assert.equal(
    await page.locator('[data-editor] [data-capture="function"]', { hasText: "echo" }).count(),
    5,
  );
  assert.match(
    await page.locator('[data-editor] [data-capture="keyword"]').allTextContents().then((texts) => texts.join(" ")),
    /if[\s\S]*then[\s\S]*fi/u,
  );
  assert.equal(
    await readSource(),
    everyScriptDirective,
  );

  const replacement = `/var/log/café.log {\n  monthly\n  rotate 2\n}\n`;
  await replaceSource(replacement);
  await page.waitForFunction(() =>
    document.querySelector("[data-tree]")?.textContent?.includes("monthly"),
  );
  assert.equal(await playground.getAttribute("data-result"), "valid");
  assert.doesNotMatch(await tree.textContent(), /postrotate/u);
  assert.ok(
    (await page.locator('[data-editor] [data-capture="string.special.path"]').textContent())
      ?.includes("café.log"),
  );

  await replaceSource("/var/log/application.log {\n  postrotate\n    reload application\n");
  await page.waitForFunction(() =>
    document.querySelector("[data-logrotate-playground]")?.getAttribute("data-result") === "issues",
  );
  assert.match(await summary.textContent(), /parse issues?/u);
  assert.match(await tree.textContent(), /ERROR|MISSING/u);

  await playground.locator('[data-mode="state"]').click();
  await page.waitForFunction(() =>
    document.querySelector("[data-source-value]")?.textContent?.startsWith("logrotate state -- version 2"),
  );
  assert.equal(await playground.getAttribute("data-result"), "valid");
  assert.match(await tree.textContent(), /keyword: header_keyword/u);
  assert.match(await tree.textContent(), /timestamp: timestamp/u);
  assert.ok(await page.locator('[data-editor] [data-capture="number"]').count() >= 7);

  for (const [index, expectedResult] of ["valid", "valid", "valid", "issues"].entries()) {
    await examplePicker.selectOption(String(index));
    assert.equal(
      await playground.getAttribute("data-result"),
      expectedResult,
      `state example ${String(index + 1)}`,
    );
  }

  await examplePicker.selectOption("3");
  await page.waitForFunction(() =>
    document.querySelector("[data-logrotate-playground]")?.getAttribute("data-result") === "issues",
  );
  assert.match(await tree.textContent(), /invalid_record/u);
  assert.equal(
    await page.locator('[data-editor] [data-capture="error"]').textContent(),
    "yesterday",
  );

  await replaceSource("logrotate state -- version 2\n");
  await source.press("Tab");
  assert.match(await readSource(), /\n  $/u);
  await source.fill("");
  await source.pressSequentially("da");
  await page.waitForTimeout(250);
  assert.equal(await completion.isVisible(), false, "state files must not offer configuration directives");

  await playground.locator("[data-reset]").click();
  assert.match(await readSource(), /yesterday/u);
  await playground.locator("[data-copy-tree]").click();
  await page.waitForFunction(() =>
    document.querySelector("[data-copy-tree]")?.textContent === "Copied",
  );
  assert.equal(await playground.locator("[data-copy-tree]").textContent(), "Copied");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await tree.textContent());

  await playground.locator('[data-mode="configuration"]').click();
  await page.waitForFunction(() =>
    document.querySelector("[data-source-value]")?.textContent?.includes("postrotate"),
  );

  await source.fill("");
  await source.pressSequentially("da");
  await completion.waitFor();
  assert.deepEqual(await completionLabels(), [
    "daily",
    "dateext",
    "dateformat",
    "datehourago",
    "dateyesterday",
  ]);
  await source.press("Escape");

  await source.fill("");
  await source.pressSequentially("pre");
  await page.waitForTimeout(250);
  assert.equal(await completion.isVisible(), false, "script openers belong inside rotation blocks");

  await source.fill("postrotate");
  await source.press("Enter");
  assert.equal(await readSource(), "postrotate\n");
  await source.pressSequentially("da");
  await completion.waitFor();
  assert.deepEqual(await completionLabels(), [
    "daily",
    "dateext",
    "dateformat",
    "datehourago",
    "dateyesterday",
  ]);
  await source.press("Escape");

  await source.fill("/var/log/application.log {\n  ");
  await source.pressSequentially("pre");
  await completion.waitFor();
  assert.deepEqual(await completionLabels(), ["preremove", "prerotate"]);
  await source.press("ArrowDown");
  await source.press("Enter");
  assert.match(await readSource(), /\n  prerotate$/u);

  await source.fill("/var/log/application.log {\n  ");
  await source.pressSequentially("inc");
  await page.waitForTimeout(250);
  assert.equal(await completion.isVisible(), false, "include belongs at global scope");

  await source.fill("/var/log/application.log {\n  postrotate\n    ");
  await source.pressSequentially("end");
  await completion.waitFor();
  assert.deepEqual(await completionLabels(), ["endscript"]);
  await source.press("Enter");
  assert.match(await readSource(), /\n {2}endscript$/u);

  await source.fill(`/var/log/application.log {
  postrotate
    if true; then
      echo ready
      `);
  await source.pressSequentially("else");
  await page.waitForTimeout(250);
  assert.equal(await completion.isVisible(), false, "else must dismiss the endscript completion");
  assert.match(await readSource(), /\n {4}else$/u);
  await source.press("Enter");
  assert.match(await readSource(), /\n {4}else\n {6}$/u);

  await source.fill(`/var/log/incomplete.log {
  postrotate
    echo still-editing
}
/var/log/healthy.log {`);
  await source.press("Enter");
  assert.match(await readSource(), /\/var\/log\/healthy\.log \{\n {2}$/u);
  await source.pressSequentially("rot");
  await completion.waitFor();
  assert.deepEqual(await completionLabels(), ["rotate"]);
  await source.press("Enter");
  assert.match(await readSource(), /\n {2}rotate$/u);

  await source.fill(`/var/log/one.log
# another application
/var/log/two.log
{`);
  await source.press("Enter");
  assert.match(await readSource(), /\n\{\n {2}$/u);

  await source.fill("/var/log/application.log {\n\tpostrotate");
  await source.press("Enter");
  assert.match(await readSource(), /\n\tpostrotate\n {4}$/u);
  await source.pressSequentially("echo ready");
  await source.press("Enter");
  await source.pressSequentially("endscript");
  assert.match(await readSource(), /\n {2}endscript$/u);
  await source.press("Escape");

  await source.fill("/var/log/application.log {\n  rotate ");
  await source.pressSequentially("da");
  await page.waitForTimeout(250);
  assert.equal(await completion.isVisible(), false, "directive arguments must remain ordinary text");

  await source.fill("/var/log/application.log ");
  await source.pressSequentially("{");
  assert.equal(await readSource(), "/var/log/application.log {}");
  await source.press("Enter");
  assert.equal(await readSource(), "/var/log/application.log {\n  \n}");

  await source.fill("/var/log/application.log {");
  await source.press("Enter");
  assert.equal(await readSource(), "/var/log/application.log {\n  ");
  await source.pressSequentially("postrotate");
  await source.press("Enter");
  assert.match(await readSource(), /postrotate\n {4}$/u);
  await source.pressSequentially("if true; then");
  await source.press("Enter");
  assert.match(await readSource(), /if true; then\n {6}$/u);
  await source.pressSequentially("echo ready");
  await source.press("Enter");
  await source.pressSequentially("fi");
  assert.match(await readSource(), /\n {4}fi$/u);
  assert.match(await readSource(), /if true; then/u, "typing Enter must preserve then");
  await source.press("Enter");
  await source.pressSequentially("# reload completed");
  assert.match(await readSource(), /\n {4}# reload completed$/u);
  await source.press("Enter");
  await source.pressSequentially("endscript");
  assert.match(await readSource(), /\n {2}endscript$/u);
  await source.press("Enter");
  await source.pressSequentially("}");
  assert.match(await readSource(), /\n\}$/u);

  await source.fill("/var/log/application.log {");
  await source.press("Enter");
  await source.pressSequentially("postrotate");
  await source.press("Enter");
  await source.pressSequentially("for service in api worker; do");
  await source.press("Enter");
  assert.match(await readSource(), /for service in api worker; do\n {6}$/u);
  await source.pressSequentially('case "$service" in');
  await source.press("Enter");
  assert.match(await readSource(), /case "\$service" in\n {8}$/u);
  await source.pressSequentially("api)");
  await source.press("Enter");
  assert.match(await readSource(), /api\)\n {10}$/u);
  await source.pressSequentially("echo api");
  await source.press("Enter");
  await source.pressSequentially(";;");
  assert.match(await readSource(), /\n {8};;$/u);
  await source.press("Enter");
  await source.pressSequentially("esac");
  assert.match(await readSource(), /\n {6}esac$/u);
  await source.press("Enter");
  await source.pressSequentially("done");
  assert.match(await readSource(), /\n {4}done$/u);
  await source.press("Enter");
  await source.pressSequentially("endscript");
  assert.match(await readSource(), /\n {2}endscript$/u);

  await replaceSource(`/var/log/application.log {
  postrotate
    for service in api worker; do
      case "$service" in
        api)
          echo api
          ;;
      esac
    done
  endscript
}
`);
  await source.press("Control+End");
  await source.press("Control+z");
  await source.press("Control+y");
  assert.match(await readSource(), /\n\}\n$/u);
  await playground.locator("[data-reset]").click();
  await page.waitForFunction(() =>
    document.querySelector("[data-tree]")?.textContent?.includes("systemctl"),
  );
  await page.setViewportSize({ width: 1910, height: 1150 });
  const playgroundBox = await playground.boundingBox();
  const workspaceBox = await page.locator(".workspace").boundingBox();
  const desktopSourceBox = await page.locator(".source-panel").boundingBox();
  const desktopTreeBox = await page.locator(".tree-panel").boundingBox();
  const resultBox = await page.locator(".result-bar").boundingBox();
  assert.ok(playgroundBox && workspaceBox && desktopSourceBox && desktopTreeBox && resultBox);
  assert.ok(playgroundBox.width >= 1300, "the workbench should use the wide desktop canvas");
  assert.ok(Math.abs(desktopSourceBox.width - desktopTreeBox.width) <= 2);
  assert.equal(desktopSourceBox.y, desktopTreeBox.y);
  assert.equal(desktopSourceBox.height, desktopTreeBox.height);
  assert.equal(desktopSourceBox.height, workspaceBox.height);
  assert.ok(resultBox.y + resultBox.height <= 1150);

  const treeScroll = await tree.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollbarColor: getComputedStyle(element).scrollbarColor,
    scrollHeight: element.scrollHeight,
  }));
  assert.ok(treeScroll.scrollHeight > treeScroll.clientHeight);
  assert.notEqual(treeScroll.scrollbarColor, "auto");
  await tree.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  assert.ok(await tree.evaluate((element) => element.scrollTop > 0));
  const lastTreeLineBox = await page.locator("[data-tree] .tree-line").last().boundingBox();
  const visibleTreeBox = await tree.boundingBox();
  assert.ok(lastTreeLineBox && visibleTreeBox);
  assert.ok(lastTreeLineBox.y + lastTreeLineBox.height <= visibleTreeBox.y + visibleTreeBox.height);

  const lineNumberElements = page.locator(
    '[data-editor] .cm-lineNumbers .cm-gutterElement:not([style*="visibility: hidden"])',
  ).filter({ hasText: /^\d+$/u });
  const sourceLineCount = (await readSource()).split("\n").length;
  assert.equal(await lineNumberElements.count(), sourceLineCount);
  const firstLineNumberBox = await lineNumberElements.nth(0).boundingBox();
  const secondLineNumberBox = await lineNumberElements.nth(1).boundingBox();
  assert.ok(firstLineNumberBox && secondLineNumberBox);
  assert.ok(secondLineNumberBox.y > firstLineNumberBox.y);

  await page.setViewportSize({ width: 390, height: 844 });
  const sourceBox = await page.locator(".source-panel").boundingBox();
  const treeBox = await page.locator(".tree-panel").boundingBox();
  assert.ok(sourceBox && treeBox);
  assert.ok(treeBox.y >= sourceBox.y + sourceBox.height);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );
  assert.deepEqual(browserErrors, []);

  process.stdout.write(
    "Chromium exercised CodeMirror editing, scoped completion, nested indentation, configuration, state, highlighting, copy, and responsive layout.\n",
  );
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
