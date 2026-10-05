import { tmpdir } from "node:os";

export type ProcessCaptureCapability =
  | { readonly available: true; readonly backend: "node-pty" }
  | {
      readonly available: false;
      readonly backend: "node-pty";
      readonly reason: string;
    };

const NATIVE_PTY_PACKAGE = "@lydell/node-pty";

/** Machine-readable code an unknown thrown value carries, when it has one. */
const thrownCode = (failure: unknown): string | undefined =>
  failure instanceof Error && "code" in failure
    ? typeof failure.code === "string"
      ? failure.code
      : undefined
    : undefined;

/** Numeric errno an unknown thrown value carries, when it has one. */
const thrownErrno = (failure: unknown): number | undefined =>
  failure instanceof Error && "errno" in failure
    ? typeof failure.errno === "number"
      ? failure.errno
      : undefined
    : undefined;

/** Failure detail an unknown thrown value carries, or an explicit unknown. */
const thrownDetail = (failure: unknown): string => {
  if (failure instanceof Error) {
    const message = failure.message.trim();
    return message === "" ? "no error detail was reported" : message;
  }
  return typeof failure === "string" && failure.trim() !== ""
    ? failure.trim()
    : "no error detail was reported";
};

const ABI_LOAD_PATTERN =
  /compiled against a different Node\.js version|NODE_MODULE_VERSION|invalid ELF header|not a valid Win32 application/i;

/** Host identity the native PTY backend was probed on. */
export type NativePtyProbeHost = {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly nodeVersion: string;
};

/**
 * Explain why a native PTY backend probe failed, naming the observed failure
 * kind instead of a spawn claim that only one kind supports.
 */
export const nativePtyProbeFailureReason = (
  failure: unknown,
  probeShell: string,
  host: NativePtyProbeHost,
): string => {
  const { platform, arch, nodeVersion } = host;
  const code = thrownCode(failure);
  if (code === "ERR_MODULE_NOT_FOUND")
    return `the optional native dependency ${NATIVE_PTY_PACKAGE} is not installed for ${platform}-${arch}; reinstall REA for this platform and architecture`;
  if (
    code === "ERR_DLOPEN_FAILED" ||
    ABI_LOAD_PATTERN.test(thrownDetail(failure))
  )
    return `the prebuilt ${NATIVE_PTY_PACKAGE} backend could not load its native binding on Node ${nodeVersion} (${platform}-${arch}); rebuild the backend for the running Node ABI`;
  if (code !== undefined) {
    const errno = thrownErrno(failure);
    return `the ${NATIVE_PTY_PACKAGE} backend could not start the ${probeShell} probe process (${code}${errno === undefined ? "" : `, errno ${String(errno)}`}); verify that ${probeShell} is executable for the current user`;
  }
  return `the ${NATIVE_PTY_PACKAGE} backend failed the ${probeShell} probe without a machine-readable cause: ${thrownDetail(failure)}`;
};

/** Explain why process capture cannot claim owned-process cleanup on a host. */
export const processCaptureOwnershipUnavailableReason = (
  platform: NodeJS.Platform,
): string | undefined =>
  platform === "win32"
    ? "Windows process-tree ownership and cleanup are unavailable; REA cannot verify that descendants have stopped."
    : undefined;

/** Probe the actual native PTY seam instead of inferring support from the OS name. */
export const probeProcessCaptureCapability =
  async (): Promise<ProcessCaptureCapability> => {
    const ownershipReason = processCaptureOwnershipUnavailableReason(
      process.platform,
    );
    if (ownershipReason !== undefined)
      return {
        available: false,
        backend: "node-pty",
        reason: ownershipReason,
      };
    const probeShell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    try {
      const { spawn } = await import("@lydell/node-pty");
      const terminal = spawn(
        probeShell,
        process.platform === "win32" ? ["/c", "exit", "0"] : ["-c", "exit 0"],
        {
          cwd: tmpdir(),
          env: { HOME: tmpdir(), TERM: "xterm-256color" },
          cols: 80,
          rows: 24,
          name: "xterm-256color",
        },
      );
      await new Promise<void>((resolveExit) =>
        terminal.onExit(() => resolveExit()),
      );
      return { available: true, backend: "node-pty" };
    } catch (failure: unknown) {
      return {
        available: false,
        backend: "node-pty",
        reason: nativePtyProbeFailureReason(failure, probeShell, {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.versions.node,
        }),
      };
    }
  };
