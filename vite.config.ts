import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    /**
     * 타건음 녹음(.wav)은 4KB 아래라 기본값대로면 base64 로 번들 안에 박힌다.
     * PCM 은 base64 로 부풀고 gzip 도 잘 안 먹어 번들이 16KB 늘었다. 파일로 빼면
     * 따로 캐시되고 JS 는 그대로다. (D15)
     */
    assetsInlineLimit: (file) => (file.endsWith('.wav') ? false : undefined),
  },
});
