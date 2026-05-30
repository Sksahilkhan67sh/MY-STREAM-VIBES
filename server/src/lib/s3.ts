/**
 * S3 upload helper — used by the recording routes to persist recordings
 * to cloud storage instead of the ephemeral Render filesystem.
 * Works with AWS S3, Cloudflare R2, Backblaze B2, or any S3-compatible service.
 */
import * as fs from 'fs';

interface S3Config {
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  endpoint?: string; // for R2/B2/custom S3-compatible
}

function getS3Config(): S3Config | null {
  const bucket    = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const region    = process.env.S3_REGION || 'us-east-1';
  const endpoint  = process.env.S3_ENDPOINT; // optional for R2/B2

  if (!bucket || !accessKey || !secretKey) return null;
  return { bucket, accessKey, secretKey, region, endpoint };
}

export function isS3Configured(): boolean {
  return getS3Config() !== null;
}

export async function uploadToS3(filePath: string, fileName: string): Promise<string | null> {
  const cfg = getS3Config();
  if (!cfg) return null;

  try {
    // Dynamic import so the server starts even if @aws-sdk is not installed
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const clientOptions: Record<string, unknown> = {
      region: cfg.region,
      credentials: {
        accessKeyId:     cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
    };
    if (cfg.endpoint) {
      clientOptions.endpoint = cfg.endpoint;
      // R2 / B2 require path-style
      clientOptions.forcePathStyle = true;
    }

    const s3 = new S3Client(clientOptions);
    const fileBuffer = fs.readFileSync(filePath);

    await s3.send(new PutObjectCommand({
      Bucket:      cfg.bucket,
      Key:         `recordings/${fileName}`,
      Body:        fileBuffer,
      ContentType: 'video/webm',
    }));

    // Return a public URL (works for standard AWS S3 public buckets)
    // For private buckets or R2 you'll want a presigned URL or CDN URL instead
    const baseUrl = cfg.endpoint
      ? `${cfg.endpoint}/${cfg.bucket}`
      : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;

    const url = `${baseUrl}/recordings/${fileName}`;
    console.log(`✅ Uploaded ${fileName} to S3: ${url}`);
    return url;
  } catch (err) {
    console.error('S3 upload failed:', err);
    return null;
  }
}

export async function deleteFromS3(fileName: string): Promise<void> {
  const cfg = getS3Config();
  if (!cfg) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const clientOptions: Record<string, unknown> = {
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    };
    if (cfg.endpoint) { clientOptions.endpoint = cfg.endpoint; clientOptions.forcePathStyle = true; }
    const s3 = new S3Client(clientOptions);
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: `recordings/${fileName}` }));
  } catch (err) {
    console.error('S3 delete failed:', err);
  }
}
