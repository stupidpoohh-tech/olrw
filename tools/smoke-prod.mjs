/**
 * 실제로 배포된 주소를 열어 본다.
 *
 *   pnpm smoke:prod                              기본 주소
 *   SMOKE_URL=https://…pages.dev pnpm smoke:prod  다른 주소
 *
 * `ui:check*` 는 로컬 미리보기를 memoryStore 로 돈다. 번들이 제대로 서는지,
 * 자산이 실제로 내려오는지, 로그인 중계 함수가 살아 있는지는 그것으로 알 수 없다 —
 * 그건 Cloudflare 위에서만 드러난다.
 *
 * **운영 데이터는 한 줄도 건드리지 않는다.** 가입·로그인·전보 전송을 실제로
 * 하지 않고, 체험 모드(D14)만 쓴다. 체험 모드는 서버에 닿지 않고 브라우저 안
 * memoryStore 위에서만 돌기 때문에, 전보함을 만들고 전보를 쓰고 제본까지 해도
 * 운영 DB 에는 아무 일도 일어나지 않는다. 그러면서 **번들은 프로덕션 그것**이다.
 *
 * 실제 사용자 값(이메일·전보 본문·초대 코드)은 찍지 않는다.
 */
import { chromium } from 'playwright';
import { launchPath } from './chromium.mjs';

const BASE = (process.env.SMOKE_URL ?? 'https://olrw-8pt.pages.dev').replace(/\/$/, '');
/** 로컬 미리보기에는 Cloudflare 함수가 없다. 그 항목만 건너뛴다. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

console.log(`대상: ${BASE}\n`);

const browser = await chromium.launch({ ...launchPath() });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/* 콘솔과 네트워크를 처음부터 지켜본다. */
const consoleErrors = [];
const pageErrors = [];
const badResponses = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

const shot = async (name) => {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

/* ── 뜨는가 ──────────────────────────────────────────────────────────────── */

console.log('━━━ 배포 ━━━');
let landed = true;
try {
  const res = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  ok('앱 주소가 200 으로 응답한다', res && res.status() === 200, res ? String(res.status()) : '응답 없음');
} catch (e) {
  landed = false;
  ok('앱 주소가 200 으로 응답한다', false, String(e.message).slice(0, 120));
}

if (!landed) {
  console.log('\n주소에 닿지 못해 나머지를 건너뜁니다.');
  await browser.close();
  console.log(`\n━━━ ${failed}건 실패 ━━━`);
  process.exit(1);
}

ok('제호가 서 있다', (await page.locator('.intro, .app, .auth, .pair').count()) > 0);
await shot('01-home');

/* SPA 라 새 주소도 index.html 로 돌아와야 한다 (_redirects). */
{
  const res = await page.request.get(`${BASE}/some/deep/path`);
  ok('없는 경로도 앱으로 돌아온다 (SPA)', res.status() === 200, String(res.status()));
}

/* 로그인 중계 함수 (functions/auth/[[path]].js). 살아 있으면 502·503 이 아니다. */
if (LOCAL) {
  console.log('SKIP  로그인 중계 — 로컬 미리보기에는 Cloudflare 함수가 없습니다');
} else {
  const res = await page.request.get(`${BASE}/auth/get-session`, { failOnStatusCode: false });
  const s = res.status();
  ok('로그인 중계가 살아 있다', s !== 404 && s !== 502 && s !== 503,
    `HTTP ${s}${s === 404 ? ' — 함수가 배포되지 않았습니다' : ''}`);
}

/* ── 자산 ────────────────────────────────────────────────────────────────── */

console.log('\n━━━ 자산 ━━━');
{
  const assets = await page.evaluate(() => {
    const out = [];
    for (const img of document.images) out.push({ kind: 'img', ok: img.complete && img.naturalWidth > 0 });
    for (const s of document.styleSheets) {
      try { out.push({ kind: 'css', ok: (s.cssRules?.length ?? 0) > 0 }); } catch { out.push({ kind: 'css', ok: true }); }
    }
    return out;
  });
  const broken = assets.filter((a) => !a.ok);
  ok('그림과 스타일이 전부 내려왔다', broken.length === 0, `${assets.length}개 중 ${broken.length}개 실패`);
  const fonts = await page.evaluate(() => document.fonts.status);
  ok('글꼴이 준비됐다', fonts === 'loaded', fonts);
}

/* ── 체험 모드 한 바퀴 (운영 DB 에 닿지 않는다) ──────────────────────────── */

console.log('\n━━━ 체험 모드 (D12 · D14) ━━━');

// 미로그인은 곧장 체험 모드다. 배너가 뜰 때까지 기다린다.
await page.waitForSelector('.maker-auth-link', { timeout: 15000 }).catch(() => {});
ok('로그인 화면이 앞에 서지 않는다', (await page.locator('.auth').count()) === 0);
ok('하단에 로그인·계정 만들기 링크가 있다',
   (await page.locator('.maker-auth-link').count()) === 2);
ok('체험 모드라고 표시된다', (await page.locator('.header-state').count()) > 0);

/** 하단 링크를 가리는 투어 카드를 닫는다. 탭을 옮기면 다음 단계가 다시 뜬다. */
const closeTour = async () => {
  for (let i = 0; i < 12 && await page.locator('.tour-next').count(); i++) {
    await page.locator('.tour-next').first().click().catch(() => {});
    await page.waitForTimeout(180);
  }
};
await closeTour();
ok('체험 전보함의 타전실이 뜬다', await page.locator('.paper').isVisible());
await shot('02-transmit');

/* 전보 한 통 — 브라우저 저장소에만 남는다. */
{
  const before = await page.locator('.recent-list .tg').count();
  await page.click('.paper');
  await page.keyboard.type('견본 전보입니다', { delay: 8 });
  await page.click('.send');
  await page.waitForSelector('.sent', { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.sent', { state: 'detached', timeout: 8000 }).catch(() => {});
  const after = await page.locator('.recent-list .tg').count();
  ok('전보를 타전하면 보낸 목록에 쌓인다', after > before, `${before} → ${after}`);
  ok('내 전보는 전문으로 보인다',
     (await page.textContent('.recent-list')).includes('견본 전보입니다'));
}
await shot('03-sent');

/* 세 탭이 다 열린다 */
for (const label of ['수신함', '서가', '타전실']) {
  const tab = page.locator('.nav-btn', { hasText: label }).first();
  ok(`${label} 탭이 열린다`, (await tab.count()) > 0);
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(350);
    ok(`${label} 이 그려진다`, (await page.locator('.main').count()) > 0);
  }
}
await closeTour();
ok('만남 마감 단추가 살아 있다', (await page.locator('.meet').count()) > 0);
await shot('04-tabs');

/* ── 인증 화면 (계정을 만들지 않는다) ────────────────────────────────────── */

console.log('\n━━━ 인증 화면 (제출하지 않는다) ━━━');
{
  await page.locator('.nav-btn', { hasText: '타전실' }).first().click().catch(() => {});
  await page.waitForTimeout(250);
  await closeTour();
  await page.locator('.maker-auth-link', { hasText: '로그인' }).click();
  await page.waitForSelector('.auth', { timeout: 10000 });
  ok('로그인을 누르면 로그인 탭으로 열린다',
     (await page.getAttribute('.auth-tab >> nth=0', 'aria-selected')) === 'true');
  ok('주소에 자국이 남는다', (await page.evaluate(() => location.hash)) === '#login');
  ok('「비밀번호를 잊으셨나요」 가 있다', (await page.locator('.auth-forgot').count()) > 0);

  await page.click('.auth-tab >> nth=1');
  ok('계정 만들기 탭에 표시 이름 칸이 있다',
     (await page.locator('input[autocomplete="nickname"]').count()) > 0);
  ok('비밀번호는 8자 이상을 요구한다',
     (await page.getAttribute('input[type=password]', 'minlength')) === '8');

  // 비밀번호 재설정 화면까지만 — 메일을 보내지 않는다.
  await page.click('.auth-tab >> nth=0');
  await page.click('.auth-forgot');
  ok('재설정 화면은 비밀번호 칸 없이 이메일만 받는다',
     (await page.locator('input[type=email]').count()) === 1
     && (await page.locator('input[type=password]').count()) === 0);
  await page.locator('.auth-forgot', { hasText: '로그인으로' }).click().catch(() => {});

  await page.click('.auth-back');
  await page.waitForSelector('.maker-auth-link', { timeout: 8000 });
  ok('돌아가기로 체험 타전실로 돌아온다', await page.locator('.paper').isVisible());
  await shot('05-auth');
}

/* ── 페이지가 조용한가 ───────────────────────────────────────────────────── */

console.log('\n━━━ 조용한가 ━━━');
ok('치명적 런타임 오류가 없다', pageErrors.length === 0, pageErrors.slice(0, 2).join(' / '));
// 폰트 프리로드 경고 같은 것은 릴리스 블로커가 아니다. 진짜 오류만 센다.
const blockers = consoleErrors.filter((t) =>
  !/favicon|preload|Download the React DevTools|was preloaded using link preload/i.test(t));
ok('콘솔에 릴리스를 막을 오류가 없다', blockers.length === 0, blockers.slice(0, 2).join(' / '));
const missing = badResponses.filter((r) => !/^40[34] .*(favicon|_routes)/.test(r));
ok('내려오지 못한 자산이 없다', missing.length === 0, missing.slice(0, 3).join(' / '));

/* ── 번들에 새는 것이 없는가 ─────────────────────────────────────────────── */

console.log('\n━━━ 번들 ━━━');
{
  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => s.src));
  let leaked = [];
  for (const src of scripts) {
    const res = await page.request.get(src, { failOnStatusCode: false });
    if (res.status() !== 200) continue;
    const text = await res.text();
    // 값은 찍지 않는다. 종류만 센다.
    if (/[A-Za-z0-9._%+-]+@(gmail|naver|daum|kakao|hanmail|nate)\./.test(text)) leaked.push('실사용 메일');
    if (/postgres(ql)?:\/\/[^\s'"]+:[^\s'"]+@/.test(text)) leaked.push('DB 접속 문자열');
    if (/\bapiKey\s*:\s*["'][A-Za-z0-9_-]{20,}["']/.test(text)) leaked.push('파이어베이스 키');
  }
  ok('번들에 실사용 값·비밀이 없다', leaked.length === 0,
    leaked.length ? [...new Set(leaked)].join(', ') : `스크립트 ${scripts.length}개 확인`);
  const firebase = scripts.some((s) => /firebase|firestore/i.test(s));
  ok('파이어베이스 런타임이 남아 있지 않다', !firebase);
}

await browser.close();
console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
