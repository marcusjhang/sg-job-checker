import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@job-checker/observability/env";
import { decryptBuffer, encryptBuffer, sha256Hex } from "./crypto";

export type StoredObject = { key: string; size: number; sha256: string; contentType?: string };

export interface PrivateObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,300}$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Unsafe object key");
  }
}

function resolveFromRepoRoot(directory: string): string {
  if (path.isAbsolute(directory)) return directory;
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return path.join(current, directory);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(directory);
}

export class LocalPrivateObjectStore implements PrivateObjectStore {
  private readonly root: string;

  constructor(root = env().STORAGE_DIR) {
    this.root = path.resolve(resolveFromRepoRoot(root));
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Object key escapes the store");
    return full;
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const temp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, encryptBuffer(bytes), { mode: 0o600 });
    await fs.rename(temp, full);
    return { key, size: bytes.length, sha256: sha256Hex(bytes) };
  }

  async get(key: string): Promise<Buffer> {
    return decryptBuffer(await fs.readFile(this.resolve(key)));
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const stat = await fs.stat(this.resolve(key));
      return { size: stat.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class S3PrivateObjectStore implements PrivateObjectStore {
  private client: unknown = null;

  private async sdk(): Promise<{
    client: {
      send: (command: unknown) => Promise<unknown>;
      destroy?: () => void;
    };
    PutObjectCommand: new (input: unknown) => unknown;
    GetObjectCommand: new (input: unknown) => unknown;
    HeadObjectCommand: new (input: unknown) => unknown;
    DeleteObjectCommand: new (input: unknown) => unknown;
  }> {
    const mod = (await import("@aws-sdk/client-s3")) as unknown as {
      S3Client: new (input: Record<string, unknown>) => {
        send: (command: unknown) => Promise<unknown>;
        destroy?: () => void;
      };
      PutObjectCommand: new (input: unknown) => unknown;
      GetObjectCommand: new (input: unknown) => unknown;
      HeadObjectCommand: new (input: unknown) => unknown;
      DeleteObjectCommand: new (input: unknown) => unknown;
    };
    if (!this.client) {
      const config = env();
      this.client = new mod.S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: config.S3_FORCE_PATH_STYLE === "true",
        credentials: {
          accessKeyId: config.S3_ACCESS_KEY_ID ?? "",
          secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? ""
        }
      });
    }
    return {
      client: this.client as {
        send: (command: unknown) => Promise<unknown>;
        destroy?: () => void;
      },
      PutObjectCommand: mod.PutObjectCommand,
      GetObjectCommand: mod.GetObjectCommand,
      HeadObjectCommand: mod.HeadObjectCommand,
      DeleteObjectCommand: mod.DeleteObjectCommand
    };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    const { client, PutObjectCommand } = await this.sdk();
    await client.send(
      new PutObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
        ACL: "private"
      })
    );
    return { key, size: bytes.length, sha256: sha256Hex(bytes), contentType };
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const { client, GetObjectCommand } = await this.sdk();
    const response = (await client.send(
      new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: key })
    )) as { Body?: { transformToByteArray: () => Promise<Uint8Array> } };
    if (!response.Body) throw new Error("Object not found");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async head(key: string): Promise<{ size: number } | null> {
    assertSafeKey(key);
    const { client, HeadObjectCommand } = await this.sdk();
    try {
      const response = (await client.send(
        new HeadObjectCommand({ Bucket: required("S3_BUCKET"), Key: key })
      )) as { ContentLength?: number };
      return { size: response.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const { client, DeleteObjectCommand } = await this.sdk();
    await client.send(new DeleteObjectCommand({ Bucket: required("S3_BUCKET"), Key: key }));
  }
}

function required(_name: string): string {
  const value = env().S3_BUCKET;
  if (!value) throw new Error("Missing S3_BUCKET");
  return value;
}

let store: PrivateObjectStore | null = null;

export function objectStore(): PrivateObjectStore {
  if (store) return store;
  store =
    env().STORAGE_DRIVER === "s3" ? new S3PrivateObjectStore() : new LocalPrivateObjectStore();
  return store;
}

export function setObjectStoreForTests(next: PrivateObjectStore | null): void {
  store = next;
}

export function objectKeyFor(userId: string, documentId: string, kind: string): string {
  return `users/${userId}/documents/${documentId}/${kind}`;
}
