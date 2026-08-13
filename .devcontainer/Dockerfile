ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
ARG GO_IMAGE=golang:1.26.5-bookworm@sha256:53eeac89074db483fdf0ab3be1df32bf6e47562263d2d0d6baa7f26acb4957dd
ARG RUST_IMAGE=rust:1.97.1-bookworm@sha256:0e2bcaef56d041a486784e54104a81aebe0da44bd03019bd70bc0401e42e4a97
ARG JAVA_IMAGE=eclipse-temurin:25-jdk@sha256:c42fecf62f32725c65cfea284c012526d6fb31cc78123c740ebdc1cfd2dced12
ARG SWIFT_IMAGE=swift:6.3.3-bookworm@sha256:6cff2d21ba06f1e9a4ed8be471401aea173127fb1ce5c0941da15119d4caa39f
ARG BASE_IMAGE=debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258
FROM ${NODE_IMAGE} AS node_toolchain
ARG NPM_VERSION=12.0.2
RUN npm install --global "npm@${NPM_VERSION}" \
    && test "$(node --version)" = "v24.19.0" \
    && test "$(npm --version)" = "${NPM_VERSION}"

FROM ${GO_IMAGE} AS go_toolchain

FROM ${RUST_IMAGE} AS rust_toolchain
ARG CARGO_FUZZ_VERSION=0.13.2
RUN cargo install --locked --version "${CARGO_FUZZ_VERSION}" cargo-fuzz

FROM ${JAVA_IMAGE} AS java_toolchain

FROM ${SWIFT_IMAGE} AS swift_toolchain

FROM ${BASE_IMAGE}

ARG NODE_VERSION=24.19.0
ARG NPM_VERSION=12.0.2
ARG TREE_SITTER_VERSION=0.26.12
ARG LLVM_VERSION=21.0.0
ARG MAVEN_VERSION=3.9.16
ARG MAVEN_SHA512=831a8591fe20c8243b1dbe7d71e3244f31d1665b0804b2e825e38cbbe5ce0cafb8338851f90780735568773e0a6cd07bbec107cda0b896b008b861075358b6f6
ARG LOGROTATE_REVISION=3be1e9ccffe0c2245ed596183c74913d553f9f18
ARG LOGROTATE_VERSION=3.22.0.56_3be1
ARG GH_VERSION=2.97.0
ARG ZIG_VERSION=0.16.0
ARG TARGETARCH

ENV CARGO_HOME=/home/vscode/.cache/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/maven/bin:/opt/java/openjdk/bin:/usr/local/go/bin:/usr/local/cargo/bin:/opt/zig:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

COPY --from=node_toolchain /usr/local/ /usr/local/
COPY --from=go_toolchain /usr/local/go/ /usr/local/go/
COPY --from=rust_toolchain /usr/local/cargo/ /usr/local/cargo/
COPY --from=rust_toolchain /usr/local/rustup/ /usr/local/rustup/
COPY --from=java_toolchain /opt/java/openjdk/ /opt/java/openjdk/
COPY --from=swift_toolchain /usr/bin/clang* /usr/bin/
COPY --from=swift_toolchain /usr/bin/ld.lld /usr/bin/
COPY --from=swift_toolchain /usr/bin/lld* /usr/bin/
COPY --from=swift_toolchain /usr/bin/llvm-* /usr/bin/
COPY --from=swift_toolchain /usr/bin/swift* /usr/bin/
COPY --from=swift_toolchain /usr/lib/clang/ /usr/lib/clang/
COPY --from=swift_toolchain /usr/lib/swift/ /usr/lib/swift/
COPY --from=swift_toolchain /usr/libexec/swift/ /usr/libexec/swift/

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
        autoconf \
        automake \
        binutils \
        build-essential \
        ca-certificates \
        cmake \
        chromium \
        curl \
        emscripten \
        git \
        jq \
        libcurl4-openssl-dev \
        libedit-dev \
        libicu-dev \
        libncurses-dev \
        libpopt-dev \
        libpython3-dev \
        libsqlite3-dev \
        libtool \
        libxml2-dev \
        make \
        ninja-build \
        openssh-client \
        pkg-config \
        python3 \
        python3-pip \
        python3-venv \
        shellcheck \
        sudo \
        tzdata \
        uuid-dev \
        xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl --fail --location --proto '=https' --tlsv1.2 \
         "https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
         --output /tmp/maven.tar.gz \
    && echo "${MAVEN_SHA512}  /tmp/maven.tar.gz" | sha512sum --check --strict \
    && mkdir /opt/maven \
    && tar --extract --gzip --strip-components=1 --file /tmp/maven.tar.gz --directory /opt/maven \
    && rm /tmp/maven.tar.gz \
    && npm install --global --allow-scripts=tree-sitter-cli "tree-sitter-cli@${TREE_SITTER_VERSION}" \
    && git init --initial-branch=bootstrap /tmp/logrotate \
    && git -C /tmp/logrotate remote add origin https://github.com/logrotate/logrotate.git \
    && git -C /tmp/logrotate fetch --depth 128 origin \
         "${LOGROTATE_REVISION}" \
         "refs/tags/3.22.0:refs/tags/3.22.0" \
    && test "$(git -C /tmp/logrotate rev-parse FETCH_HEAD)" = "${LOGROTATE_REVISION}" \
    && git -C /tmp/logrotate checkout --detach FETCH_HEAD \
    && cd /tmp/logrotate \
    && ./autogen.sh \
    && ./configure --prefix=/usr/local \
    && make --jobs="$(nproc)" \
    && make install \
    && cd / \
    && rm -rf /tmp/logrotate \
    && case "${TARGETARCH}" in \
         amd64) gh_arch=amd64; gh_sha=a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112; zig_arch=x86_64; zig_sha=70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00 ;; \
         arm64) gh_arch=arm64; gh_sha=73ea440ecad9c9e284429997ee6f93577bc6f7bc6fba357ef62c53ad8fb641a5; zig_arch=aarch64; zig_sha=ea4b09bfb22ec6f6c6ceac57ab63efb6b46e17ab08d21f69f3a48b38e1534f17 ;; \
         *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl --fail --location --proto '=https' --tlsv1.2 \
         "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${gh_arch}.tar.gz" \
         --output /tmp/gh.tar.gz \
    && echo "${gh_sha}  /tmp/gh.tar.gz" | sha256sum --check --strict \
    && tar --extract --gzip --file /tmp/gh.tar.gz --directory /tmp \
    && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_${gh_arch}/bin/gh" /usr/local/bin/gh \
    && curl --fail --location --proto '=https' --tlsv1.2 \
         "https://ziglang.org/download/${ZIG_VERSION}/zig-${zig_arch}-linux-${ZIG_VERSION}.tar.xz" \
         --output /tmp/zig.tar.xz \
    && echo "${zig_sha}  /tmp/zig.tar.xz" | sha256sum --check --strict \
    && mkdir /opt/zig \
    && tar --extract --xz --strip-components=1 --file /tmp/zig.tar.xz --directory /opt/zig \
    && rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_${gh_arch}" /tmp/zig.tar.xz \
    && groupadd --gid 1000 vscode \
    && useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash vscode \
    && echo 'vscode ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/vscode \
    && chmod 0440 /etc/sudoers.d/vscode \
    && install -d -o vscode -g vscode /home/vscode/.cache /home/vscode/.npm

COPY --from=swift_toolchain /usr/lib/libIndexStore.so* /usr/lib/

RUN node --version \
    && npm --version \
    && tree-sitter --version \
    && java -version \
    && mvn --version \
    && logrotate --version \
    && clang --version \
    && test "$(node --version)" = "v${NODE_VERSION}" \
    && test "$(npm --version)" = "${NPM_VERSION}" \
    && test "$(tree-sitter --version)" = "tree-sitter ${TREE_SITTER_VERSION}" \
    && test "$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d. -f1)" = "25" \
    && test "$(mvn --version | head -n 1 | cut -d' ' -f3)" = "${MAVEN_VERSION}" \
    && test "$(logrotate --version | head -n 1)" = "logrotate ${LOGROTATE_VERSION}" \
    && clang --version | grep --fixed-strings "clang version ${LLVM_VERSION}"

RUN printf '%s\n' \
      'export RUSTUP_HOME=/usr/local/rustup' \
      'export JAVA_HOME=/opt/java/openjdk' \
      'export PATH=/opt/maven/bin:/opt/java/openjdk/bin:/usr/local/go/bin:/usr/local/cargo/bin:/opt/zig:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
      >/etc/profile.d/tree-sitter-logrotate-toolchains.sh \
    && chmod 0644 /etc/profile.d/tree-sitter-logrotate-toolchains.sh

USER vscode
WORKDIR /workspaces/tree-sitter-logrotate
