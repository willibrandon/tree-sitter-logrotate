import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (path) => readFile(resolve(repositoryRoot, path), "utf8");

test("shared file recognition cases preserve the editor integration contract", async () => {
  const fixture = JSON.parse(await read("test/fixtures/file-recognition.json"));

  assert.equal(fixture.configuration.language, "logrotate");
  assert.deepEqual(fixture.configuration.fileNames.accepted, [
    "/etc/logrotate.conf",
    "C:/ProgramData/logrotate/logrotate.conf",
    "/etc/logrotate.d/application",
    "C:/ProgramData/logrotate/logrotate.d/application",
    "/tmp/application.logrotate",
    "/tmp/application.logrotate.conf",
  ]);
  assert.deepEqual(fixture.configuration.fileNames.rejected, [
    "/tmp/application.conf",
    "/etc/logrotate.d/nested/application",
    "C:/ProgramData/logrotate/logrotate.d/nested/application",
    "/var/lib/logrotate.status",
    "/var/lib/logrotate/status",
  ]);

  const detector = new RegExp(fixture.configuration.firstLine.pattern, "u");
  for (const line of fixture.configuration.firstLine.accepted) {
    assert.ok(detector.test(line), line);
  }
  for (const line of fixture.configuration.firstLine.rejected) {
    assert.equal(detector.test(line), false, line);
  }

  const boundary = fixture.configuration.firstLine.boundary;
  const prefix = boundary.prefix + boundary.repeat.repeat(boundary.count);
  const accepted = prefix + boundary.acceptedSuffix;
  const rejected = prefix + boundary.rejectedSuffix;
  assert.equal(accepted.length, fixture.configuration.firstLine.maximumLength);
  assert.equal(
    rejected.length,
    fixture.configuration.firstLine.maximumLength + 1,
  );
  assert.ok(detector.test(accepted));
  assert.ok(detector.test(rejected));

  assert.equal(fixture.state.language, "logrotate_state");
  assert.deepEqual(fixture.state.fileNames.accepted, [
    "/var/lib/logrotate.status",
    "C:/ProgramData/logrotate/logrotate.status",
    "/var/lib/logrotate/status",
    "C:/ProgramData/logrotate/status",
  ]);
  const stateDetector = new RegExp(fixture.state.firstLine.pattern, "u");
  for (const line of fixture.state.firstLine.accepted) {
    assert.ok(stateDetector.test(line), line);
  }
  for (const line of fixture.state.firstLine.rejected) {
    assert.equal(stateDetector.test(line), false, line);
  }

  assert.equal(fixture.includes.rootMustBeOpen, true);
  assert.deepEqual(
    fixture.includes.accepted.map(({ name }) => name),
    [
      "relative file",
      "absolute file",
      "quoted file",
      "directory",
      "Windows relative file",
      "Windows absolute file",
    ],
  );
  assert.deepEqual(
    fixture.includes.rejected.map(({ name }) => name),
    [
      "closed root",
      "missing target",
      "nested directory entry",
      "wildcard target",
    ],
  );
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
    assert.match(source, /logrotate\.status/u);
    assert.match(source, /logrotate\/status/u);
    assert.match(source, /logrotate state -- version 1/u);
    assert.match(source, /logrotate state -- version 2/u);
    assert.match(source, /include`?\s+directives?/iu);
    assert.match(source, /open (?:configuration )?root/iu);
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
    assert.match(
      source,
      /does\s+not\s+support\s+first-line\s+file\s+type\s+detection/iu,
    );
    assert.match(source, /logrotate_state/u);
    assert.match(source, /Bash\s+injection/iu);
    assert.match(source, /all\s+five\s+script/iu);
    assert.match(
      source,
      /rotation(?:-| )(?:stanza|block)[\s\S]{0,240}section/iu,
    );
    assert.match(source, /literal-separator\s*=\s*true/u);
    assert.doesNotMatch(
      source,
      /nested path[\s\S]{0,120}(?:accepted|known) host limitation/iu,
    );
  }
});
