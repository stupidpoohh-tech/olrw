/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
