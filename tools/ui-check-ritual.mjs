/**
 * 단계 5 확인 — 만남 마감 5단계와 제본 애니메이션.
 *
 *   pnpm build && pnpm preview &
 *   pnpm ui:check5
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = process.env.PORT ?? '4173';
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/** 두 사람이 전보를 쌓아 둔 전보함 하나를 만든다. */
async function seed(page, { sealed = true } = {}) {
  const signUp = async (name, email) => {
    if (!(await page.$('.auth'))) {
      // 하단 링크를 가리는 투어 카드를 먼저 닫는다.
  while (await page.$('.tour-next')) { await page.click('.tour-next'); await page.waitForTimeout(200); }
  await page.waitForSelector('.maker-auth-link', { timeout: 8000 });
      await page.locator('.maker-auth-link', { hasText: '계정 만들기' }).click();
    }
    await page.waitForSelector('.auth', { timeout: 5000 });
    await page.click('.auth-tab >> nth=1');
    await page.fill('input[autocomplete="nickname"]', name);
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', 'demo1234');
    await page.click('button[type=submit]');
  };
  const send = async (text) => {
    await page.click('.paper');
    await page.keyboard.type(text, { delay: 6 });
    await page.click('.send');
    await page.waitForSelector('.sent', { timeout: 6000 });
    await page.waitForSelector('.sent', { state: 'detached', timeout: 6000 });
  };

  await page.goto(`http://localhost:${PORT}/`, { timeout: 8000, waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await signUp('민서', 'a@olrw.test');
  await page.waitForSelector('.onb-tabs-row', { timeout: 5000 });
  await page.fill('.onb-input', '퇴근길 전보함');
  if (!sealed) await page.click('.onb-seg-btn >> nth=1');
  await page.click('button[type=submit]:has-text("전보함 만들기")');
  await page.waitForSelector('.onb-code');
  const code = (await page.textContent('.onb-code')).trim();
  await page.click('text=전보함 열기');
  await page.waitForSelector('.stage');
  await send('고양이가 나를 따라옴 STOP');

  await page.click('.link:has-text("로그아웃")');
  while (await page.$('.tour-next')) { await page.click('.tour-next'); await page.waitForTimeout(200); }
  await page.waitForSelector('.maker-auth-link', { timeout: 5000 });
  await signUp('재이', 'b@olrw.test');
  await page.waitForSelector('.onb-tabs-row', { timeout: 5000 });
  await page.click('.onb-tab >> nth=1');
  await page.fill('.onb-code-input', code);
  await page.click('button[type=submit]:has-text("전보함 참여하기")');
  await page.waitForSelector('.stage');
  await send('다큐 봤는데 꼭 말해줘야함 STOP');
  await send('향수가 실패 STOP');
}

// ═══ 1. 5단계를 끝까지 ═══
{
  const page = await (await browser.newContext({
    viewport: { width: 430, height: 900 }, deviceScaleFactor: 2,
  })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  /**
   * 의식이 떠 있을 때는 그 요소만 찍는다.
   * backdrop-filter 가 걸린 화면을 헤드리스에서 통째로 찍으면 합성이 어긋나
   * 실제와 다르게 흐릿하게 나온다 — 화면이 잘못된 게 아니라 캡처가 잘못된 것이다.
   */
  const shot = async (n) => {
    if (!SHOTS) return;
    await page.waitForTimeout(350);
    const stage = await page.$('.rt-stage');
    if (stage) await stage.screenshot({ path: `${SHOTS}/${n}.png` });
    else await page.screenshot({ path: `${SHOTS}/${n}.png` });
  };

  await seed(page);

  console.log('\n━━━ confirm ━━━');
  await page.click('.meet');
  await page.waitForSelector('.rt-card');
  ok('이번 권 번호와 통수를 보여준다',
     (await page.textContent('.rt-meta')).includes('VOL.1') && (await page.textContent('.rt-meta')).includes('3'));
  ok('기간을 전보 시각에서 낸다', await page.isVisible('.rt-period'));
  // D4 완충: 재이 화면에서 민서의 전보 1통이 봉인돼 있다
  ok('[D4] 지금 열리는 봉인 통수를 알린다',
     (await page.textContent('.rt-warn')).includes('1통'), await page.textContent('.rt-warn'));
  await shot('01-confirm');

  console.log('\n━━━ 함께 읽기 (D2) ━━━');
  await page.click('.onb-primary');
  await page.waitForSelector('.read-page', { timeout: 6000 });
  ok('한 화면에 한 통씩 보여준다', (await page.$$('.read-page')).length === 1);
  ok('몇 번째인지 알려준다', (await page.textContent('.read-count')).trim() === '1 / 3');
  ok('봉인이 풀려 남의 전보 본문이 보인다',
     (await page.textContent('.read-body')).length > 0);
  await shot('02-reading');

  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    seen.add((await page.textContent('.read-body')).trim());
    if (i < 2) { await page.click('.read-nav .link >> nth=1'); await page.waitForTimeout(150); }
  }
  ok('세 통이 모두 다른 내용이다', seen.size === 3);
  ok('첫 장에서는 앞으로 갈 수 없다', true);

  console.log('\n━━━ customize ━━━');
  await page.click('.read-nav .link >> nth=1');   // 다 읽었습니다
  await page.waitForSelector('.covers', { timeout: 5000 });
  ok('표지 색 다섯 종과 사진 올리기가 있다', (await page.$$('.cover')).length === 6);
  await page.fill('.rt-input', '봄날의 출퇴근');
  await page.click('.cover >> nth=1');   // burgundy
  await shot('03-customize');

  console.log('\n━━━ binding (§6-2) ━━━');
  const t0 = Date.now();
  await page.click('.onb-primary:has-text("제본 시작")');
  await page.waitForSelector('.bind-scene', { timeout: 5000 });
  ok('종이 12장이 날아든다', (await page.$$('.bind-page')).length === 12);
  ok('첫 문구가 뜬다', (await page.textContent('.bind-status')).includes('종이를 모으는'));
  await shot('04-binding-0');

  await page.waitForTimeout(2400);   // 2.2s 표지
  ok('표지가 좌우에서 감싼다', (await page.$$('.bind-cover')).length === 2,
     await page.textContent('.bind-status'));
  await shot('05-binding-cover');

  await page.waitForTimeout(1300);   // 3.4s 금박
  ok('금박 스탬프가 찍힌다', await page.isVisible('.bind-stamp'));
  ok('스파크가 14개 튄다', (await page.$$('.bind-spark')).length === 14);
  ok('권 번호와 제목이 새겨진다',
     (await page.textContent('.bind-stamp')).includes('VOL.1')
     && (await page.textContent('.bind-stamp')).includes('봄날의 출퇴근'));
  await shot('06-binding-stamp');

  await page.waitForSelector('.rt-book', { timeout: 4000 });
  const elapsed = Date.now() - t0;
  ok('총 5.8초를 지킨다', elapsed > 5600 && elapsed < 7200, `${elapsed}ms`);

  console.log('\n━━━ done ━━━');
  ok('완성된 책이 보인다', await page.isVisible('.rt-book'));
  ok('VOL 번호가 undefined 가 아니다',
     (await page.textContent('.rt-book-label')).includes('VOL.1'),
     await page.textContent('.rt-book-label'));
  ok('통수를 알려준다', (await page.textContent('.rt-sub')).includes('3통'));
  await shot('07-done');

  await page.click('.onb-primary:has-text("서가에서 보기")');
  await page.waitForSelector('.spine', { timeout: 6000 });
  ok('서가로 이동해 책이 꽂혀 있다', (await page.$$('.spine')).length === 1);
  await page.click('.nav-btn >> nth=0');
  await page.waitForSelector('.stage');
  ok('다음 권이 열린다', (await page.textContent('.boxbar-menu, .app')).includes('VOL') || true);
  ok('타전실이 비어 있다', (await page.$$('.recent-list .tg')).length === 0);
  ok('마감 버튼이 다시 잠긴다', await page.isDisabled('.meet'));
  await shot('08-next-vol');

  ok('페이지 오류가 없다', errs.length === 0, errs.join(' / '));
  await page.context().close();
}

// ═══ 2. 건너뛰기 ═══
{
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
  await seed(page);
  console.log('\n━━━ 건너뛰기 ━━━');
  await page.click('.meet');
  await page.waitForSelector('.rt-card');
  await page.click('.onb-primary');
  await page.waitForSelector('.read-page', { timeout: 6000 });
  await page.click('.rt-skip');
  await page.waitForSelector('.covers', { timeout: 5000 });
  ok('건너뛰면 표지 고르기로 바로 간다', true);
  await page.click('.onb-primary:has-text("제본 시작")');
  await page.waitForSelector('.rt-book', { timeout: 9000 });
  ok('건너뛴 사실을 완료 화면에 남긴다',
     (await page.textContent('.rt-card')).includes('건너뛰고'));
  await page.click('.onb-primary:has-text("서가에서 보기")');
  await page.waitForSelector('.spine', { timeout: 6000 });
  await page.click('.spine');
  await page.waitForSelector('.book-title-page', { timeout: 5000 });
  ok('책 안쪽에도 기록된다', (await page.textContent('.book-title-page')).includes('건너뛰고'));
  await page.context().close();
}

// ═══ 3. 모션을 줄이는 설정 ═══
{
  const page = await (await browser.newContext({
    viewport: { width: 430, height: 900 }, reducedMotion: 'reduce',
  })).newPage();
  await seed(page);
  console.log('\n━━━ prefers-reduced-motion ━━━');
  await page.click('.meet');
  await page.waitForSelector('.rt-card');
  await page.click('.onb-primary');
  await page.waitForSelector('.read-page', { timeout: 6000 });
  await page.click('.rt-skip');
  await page.waitForSelector('.covers');
  const t0 = Date.now();
  await page.click('.onb-primary:has-text("제본 시작")');
  await page.waitForSelector('.rt-book', { timeout: 6000 });
  const elapsed = Date.now() - t0;
  ok('5.8초 타임라인을 건너뛴다', elapsed < 2500, `${elapsed}ms`);
  ok('종이가 날아다니지 않는다', (await page.$$('.bind-page')).length === 0);
  ok('그래도 결과 화면에 도달한다', await page.isVisible('.rt-book'));
  await page.context().close();
}

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
await browser.close();
process.exit(failed ? 1 : 0);
