/**
 * 단계 3 화면이 실제로 도는지 브라우저로 확인한다.
 *
 *   pnpm build && pnpm preview &
 *   pnpm ui:check
 *
 * memoryStore 로 돌기 때문에 Supabase 없이 검증된다. memoryStore 는 서버 규칙을
 * 그대로 흉내내므로(정원 4명·용지색 중복 금지·봉인), 여기서 통과하면 규칙 쪽은
 * supabase/tests 가 따로 잡는다.
 *
 * --headed 로 눈으로 볼 수 있다. SHOTS=<디렉터리> 로 화면을 남긴다.
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
const page = await (await browser.newContext({
  viewport: { width: 430, height: 900 }, deviceScaleFactor: 2,
})).newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const shot = async (name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** 소개 화면에서 가입으로 들어간다. */
const openSignUp = async () => {
  if (await page.$('.lp')) await page.click('.lp-primary >> nth=0');
  await page.waitForSelector('.auth', { timeout: 5000 });
};
const signUp = async (name, email) => {
  await openSignUp();
  await page.click('.auth-tab >> nth=1');
  await page.fill('input[autocomplete="nickname"]', name);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'demo1234');
  await page.click('button[type=submit]');
};

try {
  await page.goto(`http://localhost:${PORT}/`, { timeout: 8000, waitUntil: 'networkidle' });
} catch {
  console.error(`http://localhost:${PORT} 에 붙지 못했습니다. "pnpm build && pnpm preview" 를 먼저 띄우세요.`);
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

console.log('\n━━━ 소개 화면 ━━━');
ok('로그인하지 않으면 소개 화면이 먼저 나온다', await page.isVisible('.lp'));
ok('로그인 화면이 강제되지 않는다', (await page.$$('.auth')).length === 0);
ok('세 마디를 다 보여준다', (await page.$$('.lp-step')).length === 3);
ok('실제 전보 카드를 보여준다', (await page.$$('.lp-demo .tg')).length === 2);
ok('실제 봉투를 보여준다', (await page.$$('.lp-demo .env')).length === 2);
ok('봉투에 본문이 없다', (await page.$$('.lp-demo .env .tg-body')).length === 0);
ok('서가를 보여준다', (await page.$$('.lp-shelf .spine')).length === 5);
await shot('01-landing');

console.log('\n━━━ 인증으로 들어가고 나오기 ━━━');
await page.click('.lp-secondary >> nth=0');
await page.waitForSelector('.auth', { timeout: 5000 });
ok('로그인을 누르면 로그인 탭으로 열린다',
   (await page.getAttribute('.auth-tab >> nth=0', 'aria-selected')) === 'true');
ok('주소에 자국이 남는다', await page.evaluate(() => location.hash) === '#login');
await page.click('.auth-back');
await page.waitForSelector('.lp', { timeout: 5000 });
ok('돌아가기로 소개 화면에 돌아온다', await page.isVisible('.lp'));

await page.click('.lp-primary >> nth=0');
await page.waitForSelector('.auth', { timeout: 5000 });
ok('전보함 열기를 누르면 가입 탭으로 열린다',
   (await page.getAttribute('.auth-tab >> nth=1', 'aria-selected')) === 'true');
await page.goBack();
await page.waitForSelector('.lp', { timeout: 5000 });
ok('브라우저 뒤로 가기도 소개로 돌아온다', await page.isVisible('.lp'));
await shot('02-auth');

console.log('\n━━━ 가입 ━━━');
await openSignUp();
await page.click('.auth-tab >> nth=1');
await page.fill('input[type=email]', 'nope@olrw.test');
await page.fill('input[type=password]', 'demo1234');
await page.click('button[type=submit]');
await page.waitForSelector('.auth-error', { timeout: 3000 });
ok('표시 이름 없이 가입하면 막고 알려준다',
   (await page.textContent('.auth-error')).includes('표시 이름'));

await page.fill('input[autocomplete="nickname"]', '민서');
await page.fill('input[type=email]', 'a@olrw.test');
await page.click('button[type=submit]');
await page.waitForSelector('text=첫 전보함을 엽니다', { timeout: 5000 });
ok('가입하면 온보딩으로 간다', true);
ok('로그인하고 나면 주소의 자국이 지워진다',
   await page.evaluate(() => location.hash) === '');

console.log('\n━━━ 전보함 만들기 (D1 봉인) ━━━');
ok('봉인함이 기본값이다', (await page.getAttribute('.onb-mode >> nth=0', 'aria-pressed')) === 'true');
await page.fill('.onb-input', '퇴근길 전보함');
await page.click('.swatches[aria-label="용지색"] button >> nth=0');   // ivory
await shot('02-create');
await page.click('button[type=submit]:has-text("전보함 만들기")');
await page.waitForSelector('.onb-code', { timeout: 5000 });
const code = (await page.textContent('.onb-code')).trim();
ok('만들고 나면 초대 코드가 보인다', /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), code);
await shot('03-code');
await page.click('text=전보함 열기');
await page.waitForSelector('.boxbar', { timeout: 5000 });
ok('봉인함이라는 표시가 전환 바에 있다', await page.isVisible('.boxbar-seal'));
await shot('04-shell');

console.log('\n━━━ 참여와 색 (§4-1 색은 정보다) ━━━');
await page.click('.link:has-text("로그아웃")');
await page.waitForSelector('.lp', { timeout: 5000 });
ok('로그아웃하면 소개 화면으로 돌아간다', true);
await signUp('재이', 'b@olrw.test');
await page.waitForSelector('text=첫 전보함을 엽니다');
await page.click('.onb-tab >> nth=1');
await page.fill('.onb-code-input', code);
await page.click('.swatches[aria-label="용지색"] button >> nth=0');   // 일부러 겹치게 ivory
await page.click('button[type=submit]:has-text("전보함 참여하기")');
await page.waitForSelector('.boxbar', { timeout: 5000 });

const swatches = await page.$$eval('.boxbar-swatch', (els) =>
  els.map((e) => `${getComputedStyle(e).backgroundColor}|${getComputedStyle(e).borderStyle}`));
ok('겹치는 색을 골라도 용지색이 달라진다',
   new Set(swatches.map((s) => s.split('|')[0])).size === 2, swatches.join('  '));
ok('테두리 스타일도 서로 다르다 (비색상 단서)',
   new Set(swatches.map((s) => s.split('|')[1])).size === 2);
ok('참여자가 두 명 보인다', (await page.$$('.boxbar-member')).length === 2);
ok('남은 자리를 알려준다', (await page.textContent('.boxbar-open')).includes('2'));
await shot('05-two-members');

await page.click('.boxbar-switch');
await page.click('text=내 설정');
await page.waitForSelector('[role=dialog]');
ok('남이 쓰는 용지색이 잠긴다',
   (await page.$$('[role=dialog] .swatch.paper[disabled]')).length === 1);
await shot('06-settings');
await page.keyboard.press('Escape');

console.log('\n━━━ 오류 안내 ━━━');
await page.click('.boxbar-switch');
await page.click('text=새 전보함 만들기 · 참여');
await page.waitForSelector('[role=dialog]');
await page.click('[role=dialog] .onb-tab >> nth=1');
await page.fill('[role=dialog] .onb-code-input', 'ZZZZ-ZZZZ');
await page.click('[role=dialog] button[type=submit]');
await page.waitForSelector('[role=dialog] .onb-error', { timeout: 3000 });
ok('없는 코드는 한국어로 알려준다',
   (await page.textContent('[role=dialog] .onb-error')).includes('찾을 수 없습니다'));
await page.keyboard.press('Escape');

console.log('\n━━━ 전환과 복원 ━━━');
await page.click('.boxbar-switch');
await page.click('text=새 전보함 만들기 · 참여');
await page.waitForSelector('[role=dialog]');
await page.fill('[role=dialog] .onb-input', '주말 전보함');
await page.click('[role=dialog] .onb-mode >> nth=1');                 // 열린함
await page.click('[role=dialog] button[type=submit]:has-text("전보함 만들기")');
await page.waitForSelector('[role=dialog] .onb-code');
await page.click('[role=dialog] >> text=전보함 열기');
await page.waitForTimeout(500);
ok('열린함에는 봉인 표시가 없다', (await page.$$('.boxbar-seal')).length === 0);
await page.click('.boxbar-switch');
const list = await page.$$eval('.boxbar-menu-item .boxbar-menu-name', (e) => e.map((x) => x.textContent));
ok('전보함 두 개가 목록에 있다', list.length === 2, JSON.stringify(list));
await shot('07-switcher');
await page.keyboard.press('Escape');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.boxbar', { timeout: 5000 });
ok('새로고침해도 보던 전보함으로 돌아온다',
   (await page.textContent('.boxbar-name')).trim() === '주말 전보함');

console.log('\n━━━ 접근성 ━━━');
const noZoom = await page.$$eval('meta[name=viewport]', (m) =>
  m.some((x) => /user-scalable\s*=\s*no|maximum-scale/.test(x.content)));
ok('핀치 줌을 막지 않는다', !noZoom);
ok('페이지 오류가 없다', pageErrors.length === 0, pageErrors.join(' / '));

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
await browser.close();
process.exit(failed ? 1 : 0);
