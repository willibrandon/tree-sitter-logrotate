export const releasePlatforms = Object.freeze([
  "linux-x64",
  "linux-arm64",
  "darwin-arm64",
  "win32-x64",
  "win32-arm64",
]);

export const nativePlatform = (path) => {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const architecture = normalized.includes("arm64") || normalized.includes("aarch64")
    ? "arm64"
    : normalized.includes("x64") || normalized.includes("x86_64") || normalized.includes("amd64")
      ? "x64"
      : undefined;
  const platform = normalized.includes("windows") || normalized.includes("win32")
    ? "win32"
    : normalized.includes("macos") || normalized.includes("darwin")
      ? "darwin"
      : normalized.includes("linux")
        ? "linux"
        : undefined;
  return platform === undefined || architecture === undefined
    ? undefined
    : `${platform}-${architecture}`;
};

export const nativeLibraryName = (platform) => platform.startsWith("win32-")
  ? "tree-sitter-logrotate.dll"
  : platform.startsWith("darwin-")
    ? "libtree-sitter-logrotate.dylib"
    : "libtree-sitter-logrotate.so";

export const wheelPlatform = (name) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("win_arm64")) return "win32-arm64";
  if (normalized.includes("win_amd64")) return "win32-x64";
  if (normalized.includes("macosx") && normalized.includes("arm64")) return "darwin-arm64";
  if ((normalized.includes("manylinux") || normalized.includes("musllinux")) && normalized.includes("aarch64")) return "linux-arm64";
  if ((normalized.includes("manylinux") || normalized.includes("musllinux")) && normalized.includes("x86_64")) return "linux-x64";
  return undefined;
};
