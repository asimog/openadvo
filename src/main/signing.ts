/**
 * V2-7: the application's Ed25519 key for filing manifests. The private key is kept encrypted
 * with Electron safeStorage (decision 9) in the user data folder and never leaves the main
 * process. Spec: docs/specs/v2.md (V2-7).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { safeStorage } from "electron";

export interface ManifestSigner {
  /** The public key, SPKI PEM. */
  publicKey(): string;
  /** A short fingerprint of the public key, for the advocate to compare. */
  fingerprint(): string;
  /** Base64 Ed25519 signature over the UTF-8 bytes of `digest`. */
  sign(digest: string): string;
}

export class KeyFileSigner implements ManifestSigner {
  private file: string;
  private key: KeyObject | null = null;

  constructor(file: string) {
    this.file = file;
  }

  /** Null when the operating system's secret store is not available: manifests are then not signed. */
  static create(file: string): KeyFileSigner | null {
    return safeStorage.isEncryptionAvailable() ? new KeyFileSigner(file) : null;
  }

  private privateKey(): KeyObject {
    if (this.key) return this.key;
    if (existsSync(this.file)) {
      this.key = createPrivateKey(safeStorage.decryptString(readFileSync(this.file)));
    } else {
      const { privateKey } = generateKeyPairSync("ed25519");
      writeFileSync(this.file, safeStorage.encryptString(privateKey.export({ type: "pkcs8", format: "pem" }).toString()), { flag: "wx" });
      this.key = privateKey;
    }
    return this.key;
  }

  publicKey(): string {
    return createPublicKey(this.privateKey()).export({ type: "spki", format: "pem" }).toString();
  }

  fingerprint(): string {
    const der = createPublicKey(this.privateKey()).export({ type: "spki", format: "der" });
    return createHash("sha256").update(der).digest("hex").slice(0, 16).replace(/(.{4})(?=.)/g, "$1 ");
  }

  sign(digest: string): string {
    return sign(null, Buffer.from(digest, "utf8"), this.privateKey()).toString("base64");
  }
}
