# Security

Report a suspected vulnerability through GitHub private vulnerability reporting for this
repository. Do not open a public issue containing exploit details, credentials, private
configuration, or other sensitive material.

Parser crashes, hangs, excessive CPU or memory use, out-of-bounds access, unsafe native library
loading, and release or package compromise are security issues. A configuration mistake, an
unsupported logrotate directive, or host-specific logrotate behavior is normally a correctness or
support issue unless it also crosses one of those security boundaries.

The parser treats every configuration and script body as untrusted data. It does not execute shell
code, resolve include paths, inspect the filesystem, access the network, or read environment
variables to change grammar behavior. The external scanner is C99, stateless, allocation-free, and
tested with AddressSanitizer, UndefinedBehaviorSanitizer, incremental edits, and fuzzed input.

Generated parser source is checked for reproducibility. Release workflows use least-privilege
permissions, immutable action revisions, protected environments, registry OIDC where available,
checksums, CycloneDX SBOMs, and GitHub artifact attestations. Development containers do not forward
host credentials or mount the Docker socket.

Before 1.0, only the current release line receives security fixes. A report should include the
affected version or revision, host and architecture, a minimized input when safe to share, observed
resource use or crash output, and whether native or WASM parsing is affected.
