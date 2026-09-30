export interface Env {
  CTBK: R2Bucket
  NJ_CRASHES: R2Bucket
  DEMO: R2Bucket
  /** The built SPA (`site/dist`), via `[assets]` in `wrangler.toml`. */
  ASSETS: Fetcher
  /** Per-deploy version id; keys the OG image cache so a deploy (new
   *  fixture, new card renderer) never serves a previous one's PNGs. */
  CF_VERSION_METADATA: WorkerVersionMetadata
  CORS_ORIGIN?: string
  /** R2 S3-compatible endpoint, `https://<account>.r2.cloudflarestorage.com`.
   *  All three buckets share an account, so one endpoint covers them all. */
  R2_S3_ENDPOINT?: string
  /** Account-scoped S3 API token (R2 dashboard → Manage API Tokens). When
   *  set alongside `R2_S3_ENDPOINT`, the worker mints presigned URLs so
   *  downloads stream directly from R2 (no worker in the data path). */
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  /** Override presign URL lifetime in seconds. Default `3600` (1h). */
  R2_PRESIGN_EXPIRES?: string
}
