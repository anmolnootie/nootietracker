import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

/**
 * Uploaded documents (POD, invoices, credit notes, damage photos...) need
 * durable storage that survives redeploys and works across horizontally-
 * scaled instances - local disk doesn't, on a PaaS like DO App Platform.
 * Falls back to local disk automatically when SPACES_* env vars aren't set,
 * so local dev is unaffected; set them and this switches to DigitalOcean
 * Spaces (S3-compatible) with no other code changes needed.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('SPACES_KEY');
    const secretAccessKey = this.configService.get<string>('SPACES_SECRET');
    const endpoint = this.configService.get<string>('SPACES_ENDPOINT');
    const bucket = this.configService.get<string>('SPACES_BUCKET');
    const region = this.configService.get<string>('SPACES_REGION') || 'us-east-1';

    if (accessKeyId && secretAccessKey && endpoint && bucket) {
      // forcePathStyle: bucket names can contain spaces/mixed case on S3-compatible
      // gateways like Supabase Storage, which virtual-hosted-style (bucket.endpoint)
      // addressing can't represent - path-style (endpoint/bucket) always works.
      this.s3 = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true });
      this.bucket = bucket;
      this.logger.log(`File storage: DigitalOcean Spaces bucket "${bucket}"`);
    } else {
      this.s3 = null;
      this.bucket = null;
      this.logger.warn('File storage: local disk (SPACES_* env vars not set - do not use this in production)');
    }
  }

  get usingCloudStorage(): boolean {
    return this.s3 !== null;
  }

  /** Persists a file and returns the value to store as DocumentEntity.filePath - an S3 object key when using Spaces, an absolute local path otherwise. */
  async save(buffer: Buffer, originalFileName: string, mimetype: string): Promise<string> {
    const key = `${randomUUID()}${path.extname(originalFileName)}`;

    if (this.s3 && this.bucket) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimetype }));
      return key;
    }

    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
    const fullPath = path.join(LOCAL_UPLOAD_DIR, key);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  /** Streams the file straight through this API's own response (keeps the existing JWT-gated download endpoint as the only access path - no separate public bucket URLs). */
  async streamTo(res: Response, filePathOrKey: string, downloadName: string): Promise<void> {
    if (this.s3 && this.bucket) {
      const obj = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: filePathOrKey }));
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
      (obj.Body as NodeJS.ReadableStream).pipe(res);
      return;
    }

    if (!fs.existsSync(filePathOrKey)) throw new NotFoundException('File no longer exists on disk');
    res.download(filePathOrKey, downloadName);
  }

  async remove(filePathOrKey: string): Promise<void> {
    if (this.s3 && this.bucket) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: filePathOrKey }));
      return;
    }
    if (fs.existsSync(filePathOrKey)) fs.unlinkSync(filePathOrKey);
  }
}
