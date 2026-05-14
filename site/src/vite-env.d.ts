/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HTTP_DEMO_BASE?: string
  readonly VITE_HTTP_DEMO_PRESIGN?: string
  readonly VITE_ALLOWED_HOSTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
