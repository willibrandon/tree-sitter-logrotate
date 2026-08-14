import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(resolve(repositoryRoot, path), "utf8");

test("shared file recognition cases preserve the editor integration contract", async () => {
  const fixture = JSON.parse(await read("test/fixtures/file-recognition.json"));

  assert.deepEqual(fixture.fileNames.accepted, [
    "/etc/logrotate.conf",
    "C:/ProgramData/logrotate/logrotate.conf",
    "/etc/logrotate.d/application",
    "C:/ProgramData/logrotate/logrotate.d/application",
    "/tmp/application.logrotate",
    "/tmp/application.logrotate.conf",
  ]);
  assert.deepEqual(fixture.fileNames.rejected, [
    "/tmp/application.conf",
    "/etc/logrotate.d/nested/application",
    "C:/ProgramData/logrotate/logrotate.d/nested/application",
    "/var/lib/logrotate/status",
  ]);

  const detector = new RegExp(fixture.firstLine.pattern, "u");
  for (const line of fixture.firstLine.accepted) {
    assert.ok(detector.test(line), line);
  }
  for (const line of fixture.firstLine.rejected) {
    assert.equal(detector.test(line), false, line);
  }

  const boundary = fixture.firstLine.boundary;
  const prefix = boundary.prefix + boundary.repeat.repeat(boundary.count);
  const accepted = prefix + boundary.acceptedSuffix;
  const rejected = prefix + boundary.rejectedSuffix;
  assert.equal(accepted.length, fixture.firstLine.maximumLength);
  assert.equal(rejected.length, fixture.firstLine.maximumLength + 1);
  assert.ok(detector.test(accepted));
  assert.ok(detector.test(rejected));
});

test("repository and public docs state the complete recognition behavior", async () => {
  const sources = await Promise.all([
    read("README.md"),
    read("docs/compatibility.md"),
    read("docs/tree-sitter-logrotate-design.md"),
    read("docs-site/src/content/docs/editors.md"),
  ]);

  for (const source of sources) {
    assert.match(source, /logrotate\.conf/u);
    assert.match(source, /logrotate\.d/u);
    assert.match(source, /\*\.logrotate/u);
    assert.match(source, /\*\.logrotate\.conf/u);
    assert.match(source, /first\s+physical\s+line/iu);
    assert.match(source, /8,192/u);
    assert.match(source, /state file/iu);
    assert.doesNotMatch(source, /detection (?:should|must) remain narrow/iu);
    assert.doesNotMatch(source, /first meaningful line/iu);
  }
});

test("Helix guidance records automatic names and the extensionless fallback", async () => {
  const design = await read("docs/tree-sitter-logrotate-design.md");
  const editors = await read("docs-site/src/content/docs/editors.md");

  for (const source of [design, editors]) {
    assert.match(source, /:set-language logrotate/u);
    assert.match(source, /:lang logrotate/u);
    assert.match(source, /does\s+not\s+support\s+first-line\s+file\s+type\s+detection/iu);
    assert.match(source, /6f0297864e944728fd5922ec6f15d986df1a0719/u);
    assert.match(source, /Bash\s+injection/iu);
    assert.match(source, /all\s+five\s+script/iu);
    assert.match(source, /rotation(?:-| )(?:stanza|block)[\s\S]{0,240}section/iu);
    assert.match(source, /literal-separator\s*=\s*true/u);
    assert.doesNotMatch(source, /nested path[\s\S]{0,120}(?:accepted|known) host limitation/iu);
  }
});
