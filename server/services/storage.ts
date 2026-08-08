import fs from 'node:fs/promises';
import path from 'node:path';
import { env, log } from '../env';

export interface StoredFile {
  storageKey: string;
  /** Set only when the object store exposes a public/permanent URL. */
  publicUrl: string | null;
}

/**
 * Optional archival copy of a generated file.
 *
 * Delivery never depends on this: download links regenerate the PDF from the
 * blueprint stored in the database, which keeps the flow working on serverless
 * platforms where local disk does not survive between invocations. Configuring
 * STORAGE_BUCKET_URL simply adds a durable copy.
 */
export async function persistFile(
  key: string,
  data: Buffer,
  contentType = 'application/pdf',
): Promise<StoredFile> {
  const bucketUrl = env.storageBucketUrl.replace(/\/$/, '');
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.STORAGE_API_KEY?.trim();

  if (bucketUrl && serviceKey) {
    try {
      const response = await fetch(`${bucketUrl}/${key}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(data),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text().catch(() => '')}`);
      }
      log('uploaded to object storage:', key);
      return { storageKey: key, publicUrl: `${bucketUrl}/${key}` };
    } catch (error) {
      console.error('[kdrama] object storage upload failed:', (error as Error).message);
    }
  }

  try {
    const target = path.resolve(process.cwd(), env.localStorageDir, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    log('wrote local copy:', target);
    return { storageKey: key, publicUrl: null };
  } catch {
    // Read-only filesystem (typical on serverless) — the DB copy is authoritative.
    return { storageKey: key, publicUrl: null };
  }
}
