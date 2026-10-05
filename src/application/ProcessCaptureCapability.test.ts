import { describe, expect, it } from "vitest";

import {
  type NativePtyProbeHost,
  nativePtyProbeFailureReason,
} from "./ProcessCaptureCapability.js";

const HOST: NativePtyProbeHost = {
  platform: "linux",
  arch: "x64",
  nodeVersion: "24.18.0",
};

const missingPackage = Object.assign(
  new Error("Cannot find module '@lydell/node-pty' imported from ..."),
  { code: "ERR_MODULE_NOT_FOUND" },
);

const abiMismatch = Object.assign(
  new Error(
    "The module '/x/node_modules/@lydell/node-pty/build/Release/pty.node' was compiled against a different Node.js version",
  ),
  { code: "ERR_DLOPEN_FAILED" },
);

const spawnDenied = Object.assign(new Error("spawn EACCES"), {
  code: "EACCES",
  errno: -13,
});

describe("native PTY probe failure reasons", () => {
  it("names the optional dependency and host when the native package is missing", () => {
    const reason = nativePtyProbeFailureReason(missingPackage, "/bin/sh", HOST);

    expect(reason).toContain("@lydell/node-pty");
    expect(reason).toContain("linux-x64");
    expect(reason).not.toContain("probe process");
  });

  it("names the Node ABI when the prebuilt binding fails to load", () => {
    const reason = nativePtyProbeFailureReason(abiMismatch, "/bin/sh", HOST);

    expect(reason).toContain("24.18.0");
    expect(reason).toContain("linux-x64");
    expect(reason).not.toContain("@lydell/node-pty is not installed");
  });

  it("names the OS error code and probe shell when spawning fails", () => {
    const reason = nativePtyProbeFailureReason(spawnDenied, "/bin/sh", HOST);

    expect(reason).toContain("EACCES");
    expect(reason).toContain("-13");
    expect(reason).toContain("/bin/sh");
  });

  it("distinguishes the three failure kinds from each other", () => {
    const reasons = new Set([
      nativePtyProbeFailureReason(missingPackage, "/bin/sh", HOST),
      nativePtyProbeFailureReason(abiMismatch, "/bin/sh", HOST),
      nativePtyProbeFailureReason(spawnDenied, "/bin/sh", HOST),
    ]);

    expect(reasons.size).toBe(3);
  });

  it("keeps an unrecognized failure useful instead of empty", () => {
    const reason = nativePtyProbeFailureReason(new Error(""), "cmd.exe", HOST);

    expect(reason).toContain("cmd.exe");
    expect(reason).toContain("no error detail was reported");
  });

  it("keeps a non-Error thrown value useful instead of empty", () => {
    const reason = nativePtyProbeFailureReason("pty gone", "/bin/sh", HOST);

    expect(reason.trim()).not.toBe("");
    expect(reason).toContain("pty gone");
  });
});
