/**
 * 단계 4 화면 확인 — 타전실 · 수신함(봉투) · 서가.
 *
 *   pnpm build && pnpm preview &
 *   pnpm ui:check4
 *
 * 두 사람을 만들어 한 전보함에 넣고, 봉인이 실제로 남의 본문을 가리는지 본다.
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

const shot = async (n) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${n}.png` }); } };
const signUp = async (name, email) => {
  // 로그인 앞에 소개 화면은 없다 (D12). 곧장 AuthScreen 으로.
  // 랜딩이 없어졌다 (D12). 하단(MakerMark)의 "계정 만들기" 링크로 들어간다.
  // 하단 링크를 가리는 투어 카드를 먼저 닫는다.
  while (await page.$('.tour-next')) { await page.click('.tour-next'); await page.waitForTimeout(200); }
  await page.waitForSelector('.maker-auth-link', { timeout: 8000 });
  await page.locator('.maker-auth-link', { hasText: '계정 만들기' }).click();
  await page.waitForSelector('.auth', { timeout: 5000 });
  await page.click('.auth-tab >> nth=1');
  await page.fill('input[autocomplete="nickname"]', name);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'demo1234');
  await page.click('button[type=submit]');
};
const type = async (s) => { await page.click('.paper'); await page.keyboard.type(s, { delay: 12 }); };
const send = async () => {
  await page.click('.send');
  await page.waitForSelector('.sent', { timeout: 5000 });
  await page.waitForSelector('.sent', { state: 'detached', timeout: 5000 });
};

await page.goto(`http://localhost:${PORT}/`, { timeout: 8000, waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// 타건음이 몇 번 울리는지 센다. strike 계열(강철·참나무·이끼)은 활자 노이즈로
// bufferSource 를 정확히 하나 만든다. 이 테스트는 기본 타자기(강철)로 도니 안전하다.
// oscillator 로 세면 강철의 금속 잔향까지 세서 결과가 부풀려진다.
await page.addInitScript(() => {
  window.__osc = 0;
  const orig = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function (...a) { window.__osc++; return orig.apply(this, a); };
});
await page.reload({ waitUntil: 'networkidle' });

// ── 방을 만들고 두 사람을 넣는다
await signUp('민서', 'a@olrw.test');
await page.waitForSelector('.onb-tabs-row', { timeout: 5000 });
await page.fill('.onb-input', '퇴근길 전보함');
await page.click('button[type=submit]:has-text("전보함 만들기")');
await page.waitForSelector('.onb-code');
const code = (await page.textContent('.onb-code')).trim();
await page.click('text=전보함 열기');
await page.waitForSelector('.stage', { timeout: 5000 });

console.log('\n━━━ 타전실 ━━━');
ok('타자기와 종이가 보인다', await page.isVisible('.tw-img') && await page.isVisible('.paper'));
ok('전보가 없으면 마감 버튼이 잠긴다', await page.isDisabled('.meet'));
await shot('01-transmit-empty');

await type('고양이가 나를 따라옴 STOP 증거는 내 기억뿐 STOP');
ok('STOP 이 따로 세워진다', (await page.$$('.paper-ink .stop')).length === 2);
ok('글자 수를 센다', (await page.textContent('.count')).startsWith('31 / 100'),
   await page.textContent('.count'));
await shot('02-typed');
await send();
ok('보내고 나면 종이가 비워진다', (await page.textContent('.count')).startsWith('0 / 100'));
ok('최근 송신에 남는다', (await page.$$('.recent-list .tg')).length === 1);
ok('전보가 쌓이면 마감 버튼이 열린다', !(await page.isDisabled('.meet')));
await shot('03-sent');

console.log('\n━━━ 해머 자리 (keys.ts) ━━━');
await page.click('.paper');
await page.keyboard.press('KeyA');
const hit = await page.$('.tw-key');
ok('키를 누르면 사진 위에서 반짝인다', hit !== null);
if (hit) {
  const box = await hit.boundingBox();
  const tw = await (await page.$('.tw')).boundingBox();
  const rx = (box.x + box.width / 2 - tw.x) / tw.width * 100;
  const ry = (box.y + box.height / 2 - tw.y) / tw.height * 100;
  // 기본 타자기(강철)의 A 는 x 26.0%, y 71.5% 다 (design/typewriters.ts).
  // 사진이나 자리표가 바뀌면 여기서 먼저 티가 난다.
  ok('A 를 누르면 A 키 자리에 온다', Math.abs(rx - 26.0) < 1.5 && Math.abs(ry - 71.5) < 1.5,
     `x ${rx.toFixed(1)}% y ${ry.toFixed(1)}%`);
}
await page.fill('.paper-input', '');

console.log('\n━━━ 타건음 (§6-1) ━━━');
await page.click('.paper');
await page.evaluate(() => { window.__osc = 0; });
await page.keyboard.type('abc', { delay: 30 });
ok('글자 하나에 타건음 하나', (await page.evaluate(() => window.__osc)) === 3,
   `${await page.evaluate(() => window.__osc)}회`);
await page.evaluate(() => { window.__osc = 0; });
await page.keyboard.press('Shift');
await page.keyboard.press('ArrowLeft');
ok('수식·이동 키에는 울리지 않는다', (await page.evaluate(() => window.__osc)) === 0,
   `${await page.evaluate(() => window.__osc)}회`);
await page.fill('.paper-input', '');

console.log('\n━━━ 한글 입력 (docs/AUDIT.md §04-3) ━━━');
// 조합 이벤트를 실제로 흉내낸다: ㅎ → 하 → 한
await page.click('.paper');
await page.evaluate(() => { window.__osc = 0; });
await page.evaluate(() => {
  const el = document.querySelector('.paper-input');
  const setValue = (v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // 'ㅎ' → '하' → '한'. 물리 키 셋을 누르지만 글자 수는 내내 1이다.
  const press = (code) => el.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, key: 'Process', code, keyCode: 229,
  }));
  el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  press('KeyG'); setValue('ㅎ');
  press('KeyK'); setValue('하');
  press('KeyS'); setValue('한');
  el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
});
await page.waitForTimeout(120);
ok('조합 중에도 누른 키만큼만 울린다', (await page.evaluate(() => window.__osc)) === 3,
   `${await page.evaluate(() => window.__osc)}회 · 글자 수는 내내 1이다`);
ok('조합이 끝나면 한 글자로 센다', (await page.textContent('.count')).startsWith('1 / 100'),
   await page.textContent('.count'));
ok('조합 중인 글자가 그대로 보인다', (await page.textContent('.paper-ink')).includes('한'));

// 100자 넘기면 송신이 막혀야 한다
await page.evaluate(() => {
  const el = document.querySelector('.paper-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, '가'.repeat(120));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(120);
ok('100자를 넘겨 붙여넣으면 잘라낸다', (await page.textContent('.count')).startsWith('100 / 100'),
   await page.textContent('.count'));
await page.fill('.paper-input', '');

console.log('\n━━━ 봉인 (D1) ━━━');
await page.click('.link:has-text("로그아웃")');
while (await page.$('.tour-next')) { await page.click('.tour-next'); await page.waitForTimeout(200); }
  await page.waitForSelector('.maker-auth-link', { timeout: 5000 });
await signUp('재이', 'b@olrw.test');
await page.waitForSelector('.onb-tabs-row', { timeout: 5000 });
await page.click('.onb-tab >> nth=1');
await page.fill('.onb-code-input', code);
await page.click('button[type=submit]:has-text("전보함 참여하기")');
await page.waitForSelector('.stage', { timeout: 5000 });
await type('다큐 하나 봤는데 꼭 말해줘야함 STOP 만나서 STOP');
await send();

await page.click('.nav-btn >> nth=1');   // 수신함
await page.waitForSelector('.inbox-notice');
ok('남이 보낸 전보가 봉투로만 보인다', (await page.$$('.env')).length === 1);
ok('봉투에는 본문이 없다', (await page.$$('.env .tg-body')).length === 0);
ok('발신인은 알려준다', (await page.textContent('.env-from')).includes('민서'));
ok('분량은 알려준다', (await page.textContent('.env-bucket')).length > 0,
   await page.textContent('.env-bucket'));
ok('봉인 통수를 센다', (await page.textContent('.inbox-sealed-n')).includes('1'));
const bodyText = await page.textContent('.inbox');
ok('본문 글자가 화면 어디에도 없다', !bodyText.includes('고양이'));
await shot('04-inbox-sealed');

console.log('\n━━━ 내 전보는 언제나 보인다 ━━━');
await page.click('.nav-btn >> nth=0');
await page.waitForSelector('.recent-list');
ok('타전실의 최근 송신은 전문으로 보인다',
   (await page.textContent('.recent-list')).includes('다큐 하나'));

console.log('\n━━━ 회수 ━━━');
page.once('dialog', (d) => void d.accept());
await page.click('.recent-list .tg-retract');
await page.waitForTimeout(500);
ok('회수하면 목록에서 사라진다', (await page.$$('.recent-list .tg')).length === 0);

console.log('\n━━━ 서가 ━━━');
await page.click('.nav-btn >> nth=2');
await page.waitForSelector('.shelves');
ok('아직 권이 없으면 그렇게 말한다', await page.isVisible('.shelf-empty'));
await shot('05-archive-empty');

// 제본된 권을 하나 만들어 서가를 확인한다 (단계 5 UI 전이라 저장소를 직접 부른다)
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('olrw.memory.v1'));
  const box = db.boxes.find((b) => b.members.some((m) => m.userId === db.sessionUserId));
  const live = db.telegrams.filter((t) => t.boxId === box.id && !t.deletedAt);
  db.volumes.push({
    id: 'v-test', boxId: box.id, vol: box.currentVol, title: '봄날의 출퇴근',
    coverKind: 'color', coverValue: 'burgundy',
    periodStart: live[0].createdAt, periodEnd: live[live.length - 1].createdAt,
    pageCount: live.length, readTogether: true, closedAt: new Date().toISOString(),
    pages: live.map((t, i) => ({
      ord: i + 1, authorId: t.authorId,
      authorName: db.users.find((u) => u.id === t.authorId).displayName,
      paperColor: box.members.find((m) => m.userId === t.authorId).paper,
      body: t.body, sentAt: t.createdAt,
    })),
  });
  live.forEach((t) => { t.deletedAt = new Date().toISOString(); });
  box.currentVol += 1;
  localStorage.setItem('olrw.memory.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'networkidle' });
await page.click('.nav-btn >> nth=2');
await page.waitForSelector('.spine', { timeout: 5000 });
ok('제본된 권이 책등으로 꽂힌다', (await page.$$('.spine')).length === 1);
await shot('06-archive');

await page.click('.spine');
await page.waitForSelector('.book-page', { timeout: 5000 });
ok('책을 펼치면 제목장이 있다', await page.isVisible('.book-vol'));
ok('페이지가 스냅샷으로 남아 있다', (await page.$$('.book-page')).length >= 1);
ok('제본된 권은 전문이 보인다', (await page.textContent('.book')).includes('고양이'));
{
  // 조상의 transform 에 갇히면 책이 화면 위쪽에서 잘린다. 실제로 그랬다.
  const stage = await (await page.$('.book-stage')).boundingBox();
  const vp = page.viewportSize();
  ok('펼친 책이 화면 전체를 덮는다',
     stage.y <= 1 && stage.height >= vp.height - 1, `y ${stage.y} h ${stage.height}`);
}
await shot('07-book');
await page.keyboard.press('Escape');

console.log('\n━━━ 마감으로 이어진다 ━━━');
// 마감 의식 자체는 pnpm ui:check5 가 본다. 여기서는 타전실에서 열리는지만 확인한다.
await page.click('.nav-btn >> nth=0');
await type('테스트 전보 STOP');
await send();
await page.click('.meet');
await page.waitForSelector('.rt-card', { timeout: 5000 });
ok('타전실에서 만남 마감이 열린다', (await page.textContent('.rt-title')).includes('이번 권을 닫습니다'));
await page.keyboard.press('Escape');
await page.waitForSelector('.rt-card', { state: 'detached', timeout: 3000 });
ok('Escape 로 닫힌다', true);

ok('페이지 오류가 없다', pageErrors.length === 0, pageErrors.join(' / '));
console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
await browser.close();
process.exit(failed ? 1 : 0);
