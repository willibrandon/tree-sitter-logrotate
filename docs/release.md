# Release process

Releases use one `vX.Y.Z` tag for every package and artifact. The tag version must match
`package.json`, `tree-sitter.json`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `Package.swift`,
`build.zig.zon`, and the generated binding metadata.

## Repository configuration

Create protected GitHub environments named `github-release`, `npm`, `pypi`, `crates-io`, and
`maven-central`. Restrict tag creation and require review for publishing environments where the
repository policy calls for it.

npm, PyPI, and crates.io use GitHub Actions trusted publishing with OIDC. Configure each registry
to trust this repository, the `release.yml` workflow, and its matching GitHub environment. PyPI
supports a pending publisher for the first release. Use project name `tree-sitter-logrotate`, owner
`willibrandon`, repository `tree-sitter-logrotate`, workflow `release.yml`, and environment `pypi`.

npm and crates.io require their package to exist before trusted publishing can be configured. For
the first release only, add environment-protected `NPM_BOOTSTRAP_TOKEN` to `npm` and
`CRATES_IO_BOOTSTRAP_TOKEN` to `crates-io`. Use tokens with the shortest practical expiration and
the minimum account permissions that permit package creation.

After `0.1.0` is published, configure npm from an authenticated npm 12 shell:

```sh
npm trust github tree-sitter-logrotate \
  --repository willibrandon/tree-sitter-logrotate \
  --file release.yml \
  --environment npm \
  --allow-publish
```

In the crates.io package settings, add a GitHub trusted publisher for owner `willibrandon`,
repository `tree-sitter-logrotate`, workflow `release.yml`, and environment `crates-io`. Remove the
bootstrap secrets after both trust relationships exist:

```sh
gh secret delete NPM_BOOTSTRAP_TOKEN --env npm
gh secret delete CRATES_IO_BOOTSTRAP_TOKEN --env crates-io
```

Later releases use only OIDC.

Maven Central does not use the same publishing path. Add environment-protected
`MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `MAVEN_GPG_PRIVATE_KEY`, and
`MAVEN_GPG_PASSPHRASE` secrets to `maven-central`. The signing key identity and the
`io.github.willibrandon` namespace must be accepted by Maven Central before tagging.

## Prepare the version

Start from an up-to-date clean `main` branch. Review every public node, field, query capture,
minimum runtime, ABI, and package dependency change since the preceding tag. Update the changelog,
then align version metadata with:

```sh
npm run release:version -- 0.1.0
npm run check:versions
```

Use the intended version in place of `0.1.0`. Commit the version and changelog before running the
release gates.

## Release gates

Run the complete source and consumer verification:

```sh
npm ci
npm run verify
npm run test:fixtures
npm run test:sanitizers
npm run test:bindings
npm run test:wasm
npm run test:performance
python3 -m venv .venv
.venv/bin/python -m pip install --requirement requirements-build.txt
PYTHON=.venv/bin/python npm run package:release
npm run verify:release
PYTHON=.venv/bin/python npm run test:release
git diff --check
```

The release-artifact consumer test installs npm and Python packages into fresh temporary projects,
loads the Java archive with JTreeSitter, and loads the standalone WASM file. Each consumer parses a
real configuration without regenerating the parser.

## Tag and publish

Push the verified commit and wait for required `main` checks. Create and push an annotated or signed
tag matching the version:

```sh
git tag -s v0.1.0 -m "tree-sitter-logrotate 0.1.0"
git push origin v0.1.0
```

The release workflow validates the tag, builds platform Node prebuilds and Python wheels, packages
all registry artifacts, checks their consumers, emits `SHA256SUMS` and CycloneDX SBOMs, creates
GitHub provenance attestations, publishes each registry package, and finally creates the GitHub
release. The GitHub release is created only after every registry job succeeds.

Inspect the workflow run, registry versions, GitHub attestations, and `SHA256SUMS` before announcing
the release. Do not upload a locally rebuilt replacement under the same version.

## Failed release

Do not move a published tag, replace a registry package, or overwrite a release asset. A failed
workflow before any registry accepts the version may be rerun from the unchanged tag after
correcting only external environment configuration.

If registry publication is partial, preserve the tag and the successful packages. Fix the release
workflow on `main`, then use the npm recovery workflow only when npm is the missing registry. Give
it the failed release run ID and existing tag:

```sh
gh workflow run recover-npm-release.yml \
  -f release_run_id=123456789 \
  -f tag=v0.1.0
```

The recovery job checks out the immutable tag, verifies that the named failed run used the same
commit, requires its assembly job to have succeeded, downloads that run's artifact, checks
`SHA256SUMS`, and verifies the tag-bound GitHub attestation before publishing. It never rebuilds or
replaces the package. An already published version is accepted only when its registry integrity
matches the verified tarball.

An npm tarball on disk must be passed with an explicit relative path such as
`./dist/tree-sitter-logrotate-0.1.0.tgz`. Without `./`, npm can interpret the value as a GitHub
repository shorthand instead of a local package.
