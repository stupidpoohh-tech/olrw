/**
 * 실제 배포 주소에서 **실제로 가입하고 로그인해** 한 사이클을 돈다.
 *
 *   E2E_URL=https://olrw-8pt.pages.dev node tools/e2e-live.mjs
 *
 * `smoke:prod` 는 체험 모드(D14)만 돈다 — 브라우저 안 memoryStore 위라서
 * Neon 에 닿지 않는다. 그래서 그것이 통과해도 브라우저 → Neon Auth → 실제 DB →
 * RLS → 화면 의 전 구간이 이어져 있는지는 알 수 없다. 여기서 그것을 본다.
 *
 * **운영 DB 에 실제로 쓴다.** 그래서 자동으로 돌지 않는다 — 손으로 돌리는
 * workflow_dispatch 에서만 돈다 (`.github/workflows/live-e2e.yml`).
 *
 * 지키는 것:
 *   - 기존 계정·전보·참여를 건드리지 않는다. 이 실행이 만든 것만 만진다.
 *   - 실제 값을 찍지 않는다. 초대 코드는 가리고, 비밀번호는 어디에도 남기지 않는다.
 *   - 남는 것(테스트 계정·전보함)은 끝에 그대로 알린다.
 */
import { chromium } from 'playwright';
import { launchPath } from './chromium.mjs';
import { randomBytes } from 'node:crypto';

const BASE = (process.env.E2E_URL ?? process.env.SMOKE_URL ?? 'https://olrw-8pt.pages.dev')
  .replace(/\/$/, '');

/** 실행마다 다른 꼬리표. 같은 계정을 두 번 만들지 않는다. */
const RUN = (process.env.GITHUB_RUN_ID ?? String(Date.now())) + '-' +
  randomBytes(3).toString('hex');

/** 지어낸 주소만 쓴다. example.com 은 RFC 2606 이 예약해 둔 도메인이라 실존하지 않는다. */
const A = { name: 'E2E가', email: `olrw-e2e-a-${RUN}@example.com` };
const B = { name: 'E2E나', email: `olrw-e2e-b-${RUN}@example.com` };
/** 비밀번호는 이 실행 안에서만 산다. 로그에도 보고서에도 남기지 않는다. */
const PW = randomBytes(12).toString('base64url');

const BOX  = `E2E ${RUN.slice(-6)}`;
const MSG_A = 'OLRW LIVE E2E TEST A1 STOP';
const MSG_B1 = 'OLRW LIVE E2E TEST B1 STOP';
const MSG_B2 = 'OLRW LIVE E2E TEST B2 STOP';

let failed = 0;
let blocked = '';
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
  return cond;
};
const skip = (label, why) => console.log(`SKIP  ${label}   ${why}`);

/** 초대 코드는 실제 값이다. 자릿수만 확인하고 가린다. */
const mask = (code) => code.replace(/[A-Z0-9]/g, '*');

/**
 * 셀렉터를 로컬 미리보기로 예행하는 문. **판정에는 쓸 수 없다** — 이 문을 열면
 * 무슨 일이 있어도 통과로 끝나지 않는다. 열어 둔 이유는 하나다: 셀렉터가
 * 어긋났는지는 운영 DB 에 쓰기 전에 알아야 한다.
 */
const REHEARSAL = process.env.E2E_ALLOW_MEMORY === '1';
if (REHEARSAL) {
  console.log('※ 리허설 모드 — memoryStore 라도 계속 갑니다. 이 실행은 판정이 아닙니다.\n');
}

console.log(`대상: ${BASE}`);
console.log(`실행 꼬리표: ${RUN}\n`);

const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), ...launchPath() });

/** 어느 호스트에 붙었는지 모은다 — 진짜 백엔드에 닿았는지 증명하는 데 쓴다. */
const seenHosts = new Set();
const pageErrors = [];

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on('request', (r) => { try { seenHosts.add(new URL(r.url()).host); } catch { /* about:blank */ } });
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  page.on('dialog', (d) => void d.accept());
  return page;
}

const closeTour = async (page) => {
  for (let i = 0; i < 14 && await page.$('.tour-next'); i++) {
    await page.click('.tour-next').catch(() => {});
    await page.waitForTimeout(160);
  }
};

/** 로그인·계정 만들기 화면을 연다. */
async function openAuth(page, which) {
  if (!(await page.$('.auth'))) {
    await closeTour(page);
    await page.waitForSelector('.maker-auth-link', { timeout: 20000 });
    await page.locator('.maker-auth-link', { hasText: which }).click();
  }
  await page.waitForSelector('.auth', { timeout: 15000 });
}

async function signUp(page, who) {
  await openAuth(page, '계정 만들기');
  await page.click('.auth-tab >> nth=1');
  await page.fill('input[autocomplete="nickname"]', who.name);
  await page.fill('input[type=email]', who.email);
  await page.fill('input[type=password]', PW);
  await page.click('button[type=submit]');
  // 셋 중 하나로 끝난다: 온보딩(성공) · 메일 확인 대기 · 오류
  await page.waitForSelector('.onb-tabs-row, .auth-title, .auth-error', { timeout: 40000 })
    .catch(() => {});
}

async function signIn(page, who) {
  await openAuth(page, '로그인');
  await page.click('.auth-tab >> nth=0');
  await page.fill('input[type=email]', who.email);
  await page.fill('input[type=password]', PW);
  await page.click('button[type=submit]');
  await page.waitForSelector('.app, .pair, .auth-error', { timeout: 40000 }).catch(() => {});
}

async function send(page, text) {
  await page.click('.paper');
  await page.keyboard.type(text, { delay: 4 });
  await page.click('.send');
  await page.waitForSelector('.sent', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.sent', { state: 'detached', timeout: 20000 }).catch(() => {});
}

const tab = async (page, label) => {
  await page.locator('.nav-btn', { hasText: label }).first().click();
  await page.waitForTimeout(600);
};

/** 화면에 무슨 오류가 떠 있는지 — 실패했을 때 이유를 알기 위해서다. */
const screenError = async (page) => {
  for (const sel of ['.auth-error', '.shell-error', '.onb-error', '.boxbar-error']) {
    const el = await page.$(sel);
    if (el) return (await el.textContent()).trim().slice(0, 120);
  }
  return '';
};

const pageA = await open();
let pageB = null;
let code = '';

try {
  /* ── 1. 배포된 앱이 진짜 백엔드로 서 있는가 ──────────────────────────── */
  console.log('━━━ 1. 배포 ━━━');
  const res = await pageA.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
  if (!ok('앱 주소가 200 으로 응답한다', res && res.status() === 200, res ? String(res.status()) : '응답 없음')) {
    blocked = '배포 주소에 닿지 못했습니다';
    throw new Error(blocked);
  }
  await pageA.evaluate(() => { try { localStorage.clear(); } catch { /* 접근 거부 */ } });
  await pageA.reload({ waitUntil: 'networkidle' });

  // memoryStore 로 떨어졌다면 화면에는 아무 표시도 없다. 번들이 실제 주소를
  // 들고 있는지로 가린다 — 없으면 이 시험 전체가 가짜다.
  {
    const scripts = await pageA.evaluate(() =>
      [...document.querySelectorAll('script[src]')].map((s) => s.src));
    let real = false;
    for (const src of scripts) {
      const r = await pageA.request.get(src, { failOnStatusCode: false });
      if (r.status() === 200 && /neon\.tech/.test(await r.text())) { real = true; break; }
    }
    if (!ok('번들이 실제 Neon 주소를 들고 있다 (memoryStore 아님)', real)) {
      if (!REHEARSAL) {
        blocked = '배포된 번들에 VITE_NEON_URL 이 없습니다 — 앱이 memoryStore 로 돌고 있습니다';
        throw new Error(blocked);
      }
      console.log('      리허설이라 계속합니다 — 이 실행은 통과로 세지 않습니다');
    }
  }

  /* ── 2. TEST USER A 가입 ─────────────────────────────────────────────── */
  console.log('\n━━━ 2. 가입 (TEST USER A) ━━━');
  await signUp(pageA, A);

  if (await pageA.$('.auth-title')) {
    const t = await pageA.textContent('.auth-title');
    if (t.includes('메일함')) {
      blocked = '가입에 메일 확인이 필요합니다 — 이 환경에서는 메일함을 열 수 없습니다';
      ok('가입 즉시 세션이 선다', false, '메일 확인 대기 화면');
      throw new Error(blocked);
    }
  }
  if (!ok('가입하면 온보딩으로 들어간다', await pageA.$('.onb-tabs-row') !== null,
          await screenError(pageA))) {
    blocked = '실제 Neon Auth 가입이 끝나지 않았습니다';
    throw new Error(blocked);
  }
  ok('로그인 화면이 남아 있지 않다', (await pageA.$('.auth')) === null);
  ok('브라우저가 Neon 백엔드에 실제로 붙었다',
     [...seenHosts].some((h) => /neon\.tech/.test(h)) ||
     [...seenHosts].some((h) => h === new URL(BASE).host),
     `${seenHosts.size}개 호스트`);

  /* ── 3. 세션이 새로고침을 견디는가 ───────────────────────────────────── */
  console.log('\n━━━ 3. 세션 유지 ━━━');
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForSelector('.onb-tabs-row, .app', { timeout: 30000 }).catch(() => {});
  ok('새로고침해도 로그인 상태가 남는다', (await pageA.$('.auth')) === null && (await pageA.$('.maker-auth-link')) === null);
  ok('체험 모드로 떨어지지 않는다', (await pageA.$('.header-state')) === null);

  /* ── 4. 전보함 생성 ─────────────────────────────────────────────────── */
  console.log('\n━━━ 4. 전보함 생성 ━━━');
  await pageA.waitForSelector('.onb-tabs-row', { timeout: 20000 });
  await pageA.fill('.onb-input', BOX);
  await pageA.click('button[type=submit]:has-text("전보함 만들기")');
  await pageA.waitForSelector('.onb-code', { timeout: 30000 });
  code = (await pageA.textContent('.onb-code')).trim();
  ok('초대 코드가 발급된다', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), mask(code));
  await pageA.click('text=전보함 열기');
  await pageA.waitForSelector('.stage', { timeout: 30000 });
  ok('타전실이 열린다', await pageA.isVisible('.paper'));
  ok('전보함 이름이 그대로다', (await pageA.textContent('.boxbar-name')).trim() === BOX);
  ok('기본이 봉인함이다 (D1)', (await pageA.$('.boxbar-seal')) !== null);

  /* ── 5. A 타전 ──────────────────────────────────────────────────────── */
  console.log('\n━━━ 5. 타전 (A) ━━━');
  await send(pageA, MSG_A);
  ok('보낸 목록에 쌓인다', (await pageA.$$('.recent-list .tg')).length === 1);
  ok('내 전보는 전문으로 보인다', (await pageA.textContent('.recent-list')).includes(MSG_A));
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForSelector('.stage', { timeout: 30000 });
  ok('새로고침해도 전보가 DB 에 남아 있다',
     (await pageA.textContent('.recent-list')).includes(MSG_A));

  /* ── 6. TEST USER B 가입 · 참여 ─────────────────────────────────────── */
  console.log('\n━━━ 6. 가입 · 참여 (TEST USER B) ━━━');
  pageB = await open();
  await pageB.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
  await pageB.evaluate(() => { try { localStorage.clear(); } catch { /* 접근 거부 */ } });
  await pageB.reload({ waitUntil: 'networkidle' });
  await signUp(pageB, B);
  if (!ok('B 도 가입된다', (await pageB.$('.onb-tabs-row')) !== null, await screenError(pageB))) {
    blocked = '두 번째 계정 가입이 끝나지 않았습니다';
    throw new Error(blocked);
  }
  await pageB.click('.onb-tab >> nth=1');
  await pageB.fill('.onb-code-input', code);
  await pageB.click('button[type=submit]:has-text("전보함 참여하기")');
  await pageB.waitForSelector('.stage', { timeout: 30000 });
  ok('초대 코드로 같은 전보함에 들어간다',
     (await pageB.textContent('.boxbar-name')).trim() === BOX, await screenError(pageB));
  ok('두 사람이 보인다', (await pageB.$$('.boxbar-member')).length === 2);

  console.log('\n━━━ 7. 타전 (B) ━━━');
  await send(pageB, MSG_B1);
  await send(pageB, MSG_B2);
  ok('B 의 전보 두 통이 쌓인다', (await pageB.$$('.recent-list .tg')).length === 2);

  /* ── 8. 봉인 (D1) — 서로의 본문이 보이지 않는가 ──────────────────────── */
  console.log('\n━━━ 8. 봉인 (D1) ━━━');
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForSelector('.stage', { timeout: 30000 });
  await tab(pageA, '수신함');
  ok('A 의 수신함에 봉투 두 통이 서 있다', (await pageA.$$('.env')).length === 2,
     `${(await pageA.$$('.env')).length}통`);
  {
    const body = await pageA.textContent('body');
    ok('A 는 B 의 본문을 볼 수 없다', !body.includes(MSG_B1) && !body.includes(MSG_B2));
    ok('봉투에 봉함 표시가 있다', (await pageA.$$('.env-seal')).length === 2);
  }
  await tab(pageB, '수신함');
  ok('B 의 수신함에 봉투 한 통이 서 있다', (await pageB.$$('.env')).length === 1);
  ok('B 는 A 의 본문을 볼 수 없다', !(await pageB.textContent('body')).includes(MSG_A));

  /* ── 9. 만남 마감 5단계 (D2 · D4) ───────────────────────────────────── */
  console.log('\n━━━ 9. 만남 마감 ━━━');
  await tab(pageA, '타전실');
  await pageA.click('.meet');
  await pageA.waitForSelector('.rt-card', { timeout: 20000 });
  ok('[confirm] 이번 권과 통수를 보여준다',
     (await pageA.textContent('.rt-meta')).includes('VOL.1')
     && (await pageA.textContent('.rt-meta')).includes('3'),
     (await pageA.textContent('.rt-meta')).trim().replace(/\s+/g, ' '));
  ok('[confirm · D4] 지금 열리는 봉인 통수를 알린다',
     (await pageA.textContent('.rt-warn')).includes('2통'));

  await pageA.click('.onb-primary');
  await pageA.waitForSelector('.read-page', { timeout: 30000 });
  ok('[함께 읽기 · D2] 봉인이 풀려 본문이 보인다',
     (await pageA.textContent('.read-body')).trim().length > 0);
  const read = new Set();
  for (let i = 0; i < 3; i++) {
    read.add((await pageA.textContent('.read-body')).trim());
    if (i < 2) { await pageA.click('.read-nav .link >> nth=1'); await pageA.waitForTimeout(250); }
  }
  ok('[함께 읽기] 세 통이 모두 다르다', read.size === 3, `${read.size}통`);
  ok('[함께 읽기] B 의 본문이 실제로 열렸다',
     [...read].some((t) => t.includes('B1')) && [...read].some((t) => t.includes('B2')));

  await pageA.click('.read-nav .link >> nth=1');
  await pageA.waitForSelector('.covers', { timeout: 20000 });
  ok('[customize] 표지를 고를 수 있다', (await pageA.$$('.cover')).length >= 5);
  await pageA.fill('.rt-input', 'E2E 제1권');
  await pageA.click('.cover >> nth=1');

  await pageA.click('.onb-primary:has-text("제본 시작")');
  await pageA.waitForSelector('.bind-scene', { timeout: 20000 });
  ok('[binding] 제본 애니메이션이 돈다', (await pageA.$$('.bind-page')).length === 12);
  await pageA.waitForSelector('.rt-book', { timeout: 30000 });
  ok('[done] 완성된 책이 보인다', await pageA.isVisible('.rt-book'));
  ok('[done] VOL 번호가 undefined 가 아니다',
     (await pageA.textContent('.rt-book-label')).includes('VOL.1'),
     (await pageA.textContent('.rt-book-label')).trim());
  ok('[done] 통수를 알려준다', (await pageA.textContent('.rt-sub')).includes('3통'));

  /* ── 10. 서가 · 다음 권 ─────────────────────────────────────────────── */
  console.log('\n━━━ 10. 서가 ━━━');
  await pageA.click('.onb-primary:has-text("서가에서 보기")');
  await pageA.waitForSelector('.spine', { timeout: 30000 });
  ok('서가에 책이 꽂힌다', (await pageA.$$('.spine')).length === 1);

  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForSelector('.app', { timeout: 30000 });
  await tab(pageA, '서가');
  ok('새로고침해도 서가에 남는다 (DB 에 제본됐다)', (await pageA.$$('.spine')).length === 1);
  await pageA.click('.spine');
  await pageA.waitForSelector('.book-title-page', { timeout: 20000 });
  ok('책을 펴면 제본된 쪽이 들어 있다', (await pageA.textContent('body')).includes(MSG_A));
  // 펼친 책은 모달이라 탭을 가린다. 닫고 나온다.
  await pageA.keyboard.press('Escape');
  await pageA.waitForSelector('.book-stage', { state: 'detached', timeout: 10000 }).catch(() => {});

  await tab(pageA, '타전실');
  ok('다음 권이 열려 타전실이 비어 있다', (await pageA.$$('.recent-list .tg')).length === 0);
  ok('마감 단추가 다시 잠긴다', await pageA.isDisabled('.meet'));

  /* ── 11. 다른 사람에게도 같은 결과가 보이는가 (RLS) ──────────────────── */
  console.log('\n━━━ 11. B 쪽에서 본 결과 (RLS) ━━━');
  await pageB.reload({ waitUntil: 'networkidle' });
  await pageB.waitForSelector('.app', { timeout: 30000 });
  await tab(pageB, '서가');
  ok('B 의 서가에도 같은 권이 꽂혀 있다', (await pageB.$$('.spine')).length === 1);
  await tab(pageB, '타전실');
  ok('B 의 타전실도 다음 권으로 비었다', (await pageB.$$('.recent-list .tg')).length === 0);

  /* ── 12. 로그아웃 → 재로그인 ────────────────────────────────────────── */
  console.log('\n━━━ 12. 재로그인 ━━━');
  await pageA.click('.link:has-text("로그아웃")');
  await pageA.waitForSelector('.maker-auth-link', { timeout: 30000 });
  ok('로그아웃하면 체험 모드로 돌아간다', (await pageA.$('.header-state')) !== null);
  await signIn(pageA, A);
  await pageA.waitForSelector('.app', { timeout: 40000 }).catch(() => {});
  ok('같은 자격으로 다시 로그인된다', (await pageA.$('.app')) !== null, await screenError(pageA));
  ok('재로그인해도 전보함이 그대로다',
     (await pageA.textContent('.boxbar-name')).trim() === BOX);
  await tab(pageA, '서가');
  ok('재로그인해도 서가가 그대로다', (await pageA.$$('.spine')).length === 1);

  /* ── 13. 조용한가 ───────────────────────────────────────────────────── */
  console.log('\n━━━ 13. 조용한가 ━━━');
  ok('치명적 런타임 오류가 없다', pageErrors.length === 0, pageErrors.slice(0, 2).join(' / '));
} catch (e) {
  if (!blocked) blocked = String(e.message).slice(0, 200);
  console.log(`\n중단: ${blocked}`);
} finally {
  /* ── 남는 것 ─────────────────────────────────────────────────────────── */
  console.log('\n━━━ 남는 것 ━━━');
  console.log(`테스트 계정 2개(꼬리표 ${RUN}) 와 전보함 「${BOX}」 가 운영 DB 에 남습니다.`);
  console.log('전보함을 나가면 멤버 없는 전보함이 되어 운영 표본 SQL 의 무결성 항목이');
  console.log('어긋납니다. 그래서 나가지 않고 그대로 둡니다 — 지우려면 콘솔에서');
  console.log('전보함 행까지 함께 지워야 합니다 (docs/RELEASE.md).');

  await browser.close();
}

if (blocked) {
  console.log(`\n━━━ 끝까지 가지 못했습니다: ${blocked} ━━━`);
  process.exit(2);
}
if (REHEARSAL) {
  console.log(failed ? `\n━━━ 리허설: ${failed}건 실패 ━━━` : '\n━━━ 리허설: 셀렉터는 전부 맞았습니다 ━━━');
  console.log('리허설은 판정이 아닙니다. 실제 판정은 배포 주소에서만 납니다.');
  process.exit(2);
}
console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
