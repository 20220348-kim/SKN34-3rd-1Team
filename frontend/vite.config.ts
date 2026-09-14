import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Docker Compose에서는 브라우저가 /api를 Vite 개발 서버로 보내고,
// Vite가 Compose 내부 DNS 이름(core-api)으로 프록시한다.
// 네이티브 개발의 기본 대상은 기존 localhost:8080을 유지한다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const usePolling = env.CHOKIDAR_USEPOLLING === 'true'
  // Docker Desktop(Windows/macOS)의 바인드 마운트는 파일 알림이 오지 않아 폴링이 필요하다.
  // 폴링은 파일마다 stat을 도는 비용이라 간격이 짧으면 Node 이벤트 루프가 막혀 /api 프록시까지 초 단위로 느려진다.
  // 기본 1초, 필요하면 CHOKIDAR_INTERVAL(ms)로 조절한다. 산출물·캐시 폴더는 감시에서 뺀다.
  const pollingInterval = Number.parseInt(env.CHOKIDAR_INTERVAL ?? '', 10) || 1_000

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      watch: usePolling
        ? { usePolling: true, interval: pollingInterval, ignored: ['**/node_modules/**', '**/.pnpm-store/**', '**/dist/**', '**/coverage/**', '**/.git/**'] }
        : undefined,
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
