/**
 * Apply (or print) the CORS policy on the R2 bucket so the browser can PUT
 * voiceover uploads directly via presigned URLs.
 *
 * Without this policy, the preflight OPTIONS from the web origin is rejected
 * ("No 'Access-Control-Allow-Origin' header") and uploads fail with net::ERR_FAILED.
 *
 * Usage (env must be loaded — R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET):
 *   node --env-file=.env scripts/r2-cors.mjs          # apply
 *   node --env-file=.env scripts/r2-cors.mjs --print  # show current policy
 *
 * Extra origins (preview deploys, custom domains) can be added via
 * CORS_ALLOWED_ORIGINS as a comma-separated list.
 */
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3';

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  CORS_ALLOWED_ORIGINS,
} = process.env;

for (const [k, v] of Object.entries({
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
})) {
  if (!v) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const defaultOrigins = [
  'https://classy-woman.vercel.app',
  'https://yuliatool-web.vercel.app',
  'http://localhost:3000',
];
const extraOrigins = (CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...extraOrigins])];

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const corsRule = {
  AllowedOrigins: allowedOrigins,
  AllowedMethods: ['PUT', 'GET', 'HEAD'],
  AllowedHeaders: ['content-type', 'content-length'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3600,
};

if (process.argv.includes('--print')) {
  const res = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
  console.log(JSON.stringify(res.CORSRules ?? [], null, 2));
  process.exit(0);
}

await client.send(
  new PutBucketCorsCommand({
    Bucket: R2_BUCKET,
    CORSConfiguration: { CORSRules: [corsRule] },
  }),
);

console.log(`Applied CORS to bucket "${R2_BUCKET}" for origins:`);
for (const o of allowedOrigins) console.log(`  - ${o}`);
