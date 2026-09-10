/**
 * 브라우저를 어디서 찾을지 한 곳에서 정한다.
 *
 * 시험 다섯 개가 저마다 `/opt/pw-browsers/chromium-1194/…` 를 적어 두고 있었다.
 * 개발 컨테이너에서는 맞지만 CI 러너에는 그 경로가 없다 — 릴리스 게이트를
 * 붙이려면 두 곳 다에서 서야 한다.
 *
 * 찾는 순서
 *   1. CHROMIUM 이 가리키는 실행 파일 (직접 지정)
 *   2. PLAYWRIGHT_BROWSERS_PATH 아래에 깔린 것 (개발 컨테이너)
 *   3. 아무것도 안 넘긴다 → Playwright 가 제 캐시에서 찾는다 (CI)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function fromBrowsersPath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return '';
  // chromium-1194/chrome-linux/chrome · chromium/chrome 두 배치를 다 본다.
  const candidates = [];
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium')) continue;
    candidates.push(join(root, entry, 'chrome-linux', 'chrome'), join(root, entry));
  }
  return candidates.find((p) => existsSync(p)) ?? '';
}

/** `chromium.launch()` 에 펼쳐 넣는다. 빈 객체면 Playwright 기본값을 쓴다. */
export function launchPath() {
  const explicit = process.env.CHROMIUM;
  if (explicit && existsSync(explicit)) return { executablePath: explicit };
  const found = fromBrowsersPath();
  return found ? { executablePath: found } : {};
}
