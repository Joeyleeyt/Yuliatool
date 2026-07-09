import type { Readable } from 'node:stream';

export interface PutObjectOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  checksumSha256?: string;
  /** Required when `body` is a stream so R2 can size the PUT without buffering. */
  contentLength?: number;
}

export interface ObjectMetadata {
  key: string;
  size: number;
  contentType: string | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
}

export interface SignedUpload {
  url: string;
  key: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string; // ISO
}

export interface SignedDownloadOptions {
  /**
   * Force the browser to save (not open) the object, under this filename, via a
   * `Content-Disposition: attachment` response override. Needed because the HTML
   * `download` attribute is ignored on cross-origin links (a presigned R2 URL).
   */
  downloadFilename?: string;
}

/**
 * Object storage abstraction. The only implementation is R2 (S3-compatible),
 * but the interface keeps callers (domain + workers) provider-agnostic and
 * trivially mockable in tests.
 */
export interface StorageService {
  putObject(key: string, body: Buffer | Uint8Array | Readable, opts?: PutObjectOptions): Promise<ObjectMetadata>;
  getObjectStream(key: string): Promise<Readable>;
  headObject(key: string): Promise<ObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  /** Delete every object under a prefix (project cleanup). Returns count deleted. */
  deletePrefix(prefix: string): Promise<number>;
  createSignedUploadUrl(input: {
    key: string;
    contentType: string;
    expiresInSec?: number;
    contentLength?: number;
  }): Promise<SignedUpload>;
  createSignedDownloadUrl(
    key: string,
    expiresInSec?: number,
    opts?: SignedDownloadOptions,
  ): Promise<string>;
  /** Public CDN URL if a public base is configured, else null. */
  publicUrl(key: string): string | null;
}
