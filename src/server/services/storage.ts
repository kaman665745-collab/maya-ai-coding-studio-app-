import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StoredObjectMeta {
  key: string;
  sha256: string;
  sizeBytes: number;
  storedAt: string;
}

export interface StorageProvider {
  readonly providerName: string;
  putObject(key: string, payload: string | Buffer): Promise<StoredObjectMeta>;
  getObject(key: string): Promise<string | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix: string): Promise<string[]>;
}

export class LocalObjectStorageAdapter implements StorageProvider {
  readonly providerName = 'local-object-storage';
  private readonly rootDir: string;

  constructor(rootDir = path.resolve(process.cwd(), process.env.ACS_STORAGE_DIR || '.acs-storage', 'objects')) {
    this.rootDir = rootDir;
  }

  private resolveSafeKey(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
      throw new Error(`Invalid storage object key: ${key}`);
    }
    const target = path.resolve(this.rootDir, normalized);
    if (!target.startsWith(this.rootDir + path.sep) && target !== this.rootDir) {
      throw new Error('Storage key escapes root directory.');
    }
    return target;
  }

  async putObject(key: string, payload: string | Buffer): Promise<StoredObjectMeta> {
    const target = this.resolveSafeKey(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    await fs.writeFile(target, buf);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    return {
      key,
      sha256,
      sizeBytes: buf.byteLength,
      storedAt: new Date().toISOString(),
    };
  }

  async getObject(key: string): Promise<string | null> {
    const target = this.resolveSafeKey(key);
    try {
      return await fs.readFile(target, 'utf8');
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const target = this.resolveSafeKey(key);
    await fs.rm(target, { force: true });
  }

  async listObjects(prefix: string): Promise<string[]> {
    const cleanPrefix = prefix.replace(/\\/g, '/').replace(/^\/+/, '');
    try {
      await fs.mkdir(this.rootDir, { recursive: true });
      const results: string[] = [];
      const walk = async (dir: string, rel: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full, nextRel);
          } else if (!cleanPrefix || nextRel.startsWith(cleanPrefix)) {
            results.push(nextRel);
          }
        }
      };
      await walk(this.rootDir, '');
      return results;
    } catch {
      return [];
    }
  }
}

export const storageProvider: StorageProvider = new LocalObjectStorageAdapter();
