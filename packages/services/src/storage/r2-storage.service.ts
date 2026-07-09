import type { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, StorageError, SIGNED_URL_TTL } from '@yulia/core';
import type {
  StorageService,
  PutObjectOptions,
  ObjectMetadata,
  SignedUpload,
  SignedDownloadOptions,
} from './storage.types.js';

/**
 * Cloudflare R2 storage via the S3-compatible API.
 *
 * R2 endpoint: https://<account>.r2.cloudflarestorage.com, region "auto".
 * All binaries in the platform live here; Postgres only stores the returned key.
 */
export class R2StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string | undefined;

  constructor(client?: S3Client) {
    this.bucket = env.R2_BUCKET;
    this.publicBase = env.R2_PUBLIC_BASE_URL;
    this.client =
      client ??
      new S3Client({
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
  }

  async putObject(
    key: string,
    body: Buffer | Uint8Array | Readable,
    opts: PutObjectOptions = {},
  ): Promise<ObjectMetadata> {
    try {
      const res = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ...(opts.contentType ? { ContentType: opts.contentType } : {}),
          ...(opts.cacheControl ? { CacheControl: opts.cacheControl } : {}),
          ...(opts.metadata ? { Metadata: opts.metadata } : {}),
          ...(opts.contentLength !== undefined ? { ContentLength: opts.contentLength } : {}),
        }),
      );
      return {
        key,
        size: 0,
        contentType: opts.contentType,
        etag: res.ETag,
        lastModified: undefined,
      };
    } catch (cause) {
      throw new StorageError(`putObject failed for ${key}`, { cause, context: { key } });
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) throw new StorageError(`Empty body for ${key}`);
      return res.Body as Readable;
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw new StorageError(`getObject failed for ${key}`, { cause, context: { key } });
    }
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (cause) {
      if (isNotFound(cause)) return null;
      throw new StorageError(`headObject failed for ${key}`, { cause, context: { key } });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (cause) {
      throw new StorageError(`deleteObject failed for ${key}`, { cause, context: { key } });
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let continuationToken: string | undefined;
    try {
      do {
        const list = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const objects: ObjectIdentifier[] = (list.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => Boolean(k))
          .map((Key) => ({ Key }));

        if (objects.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: objects, Quiet: true },
            }),
          );
          deleted += objects.length;
        }
        continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
      } while (continuationToken);
      return deleted;
    } catch (cause) {
      throw new StorageError(`deletePrefix failed for ${prefix}`, { cause, context: { prefix } });
    }
  }

  async createSignedUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSec?: number;
    contentLength?: number;
  }): Promise<SignedUpload> {
    const expiresInSec = input.expiresInSec ?? SIGNED_URL_TTL.uploadSec;
    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          ContentType: input.contentType,
          ...(input.contentLength ? { ContentLength: input.contentLength } : {}),
        }),
        { expiresIn: expiresInSec },
      );
      return {
        url,
        key: input.key,
        method: 'PUT',
        headers: { 'Content-Type': input.contentType },
        expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      };
    } catch (cause) {
      throw new StorageError(`signed upload failed for ${input.key}`, { cause });
    }
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSec?: number,
    opts?: SignedDownloadOptions,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          // A signed `response-content-disposition` override makes R2 return the
          // attachment header, so the browser downloads even cross-origin.
          ...(opts?.downloadFilename
            ? {
                ResponseContentDisposition: `attachment; filename="${sanitizeFilename(
                  opts.downloadFilename,
                )}"`,
              }
            : {}),
        }),
        { expiresIn: expiresInSec ?? SIGNED_URL_TTL.downloadSec },
      );
    } catch (cause) {
      throw new StorageError(`signed download failed for ${key}`, { cause });
    }
  }

  publicUrl(key: string): string | null {
    if (!this.publicBase) return null;
    return `${this.publicBase.replace(/\/$/, '')}/${key}`;
  }
}

/** Strip characters unsafe for a Content-Disposition filename / header value. */
function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/["\\\r\n]/g, '').replace(/[^\w.\- ]+/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'video.mp4';
}

function isNotFound(err: unknown): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number }; name?: string });
  return meta?.$metadata?.httpStatusCode === 404 || meta?.name === 'NotFound' || meta?.name === 'NoSuchKey';
}
