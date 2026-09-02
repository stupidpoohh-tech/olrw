# OLRW — Our love, rightly written (전보함)

> 제품 설계 정본은 `docs/PORTING-SPEC.md`. 값에 대한 판단이 필요하면 그 문서를 따른다.
> **확정된 변경은 `docs/decisions.md`가 우선한다.** 스펙과 어긋나면 그쪽이 최신이다.
> 진단 근거는 `docs/AUDIT.md`.

## 일하는 방식 (사용자와의 약속)

**터미널 명령어를 건네고 "이걸 실행하세요" 하지 않는다.** 사용자는 CLI 를 쓰지 않는다.

- **내가 할 수 있는 일은 내가 한다.** 코드 수정, git, 빌드, 타입체크, 테스트,
  마이그레이션 파일 작성 — 전부 직접 실행하고 **결과만 보고**한다.
  "이 명령을 돌려 보세요" 는 답이 아니다.
- **배포도 내가 한다.** 작업 가지에 밀고 끝내지 않는다 — 그건 미리보기 주소로만
  올라가고 사용자가 보는 주소(`olrw-8pt.pages.dev`)는 그대로다. 일이 끝나면
  **프로덕션 가지까지 올려 실제 주소에 반영한 뒤** 보고한다.
  "Retry deployment 를 눌러 보세요" 는 답이 아니다 — 그건 옛 커밋을 다시 빌드할 뿐이다.
  프로덕션 가지는 아래 **스택**에 적힌 가지다. 자동배포가 그것만 본다.
- **사용자 계정으로만 되는 일**(Neon 콘솔, Cloudflare 대시보드, GitHub 설정)은
  **화면 클릭 경로**로 안내한다. 순서는 항상 **메뉴 이름 → 탭 이름 → 버튼 이름**.
  화면에 실제로 적힌 글자를 그대로 쓴다.
- 값(주소·키·설정값)은 **완성된 형태로** 건넨다. 사용자가 조립하게 만들지 않는다.
- 문서(`docs/SETUP.md`)도 같은 순서를 따른다 — 클릭 경로가 먼저, 터미널은 개발자용 부록.

## 무엇을 만드는가

최대 4명이 초대 코드로 하나의 전보함에 모여 짧은 전보를 주고받고, 만나는 날 "만남 마감"으로 그 회차를 제본해 서가에 꽂는 앱.

## 절대 규칙

1. **채팅 기능을 넣지 않는다.** 읽음 표시, 타이핑 인디케이터, 실시간 스트림 UI 금지. 느림이 기능이다.
2. **은유를 깨지 않는다.** "메시지 전송" 아님 → "타전". 전보/인쇄/제본 어휘만 쓴다.
3. **색은 정보다.** 용지색 = 발신인. 역할 없는 색을 추가하지 않는다.
   전보함은 색이 아니라 **타자기 네 대**로 구분한다 — 생김새도 소리도 다르다 (D9).
   액센트는 **한 화면에 하나** — 지금 할 수 있는 행동에만 (타전실이면 송신). 경고·
   오류·본문의 STOP 은 예외다 (D17).
4. **정원 4명 상한을 올리지 않는다.** 의도적 제약이다. 올리면 느린 단톡방이 된다.
5. **카피는 담백한 존댓말.** 이모지·감탄사 금지. 느낌표 최소.
6. **인쇄물은 6px, 조작은 알약.** 종이·봉투·카드·표지는 반경 최대 6px — 인쇄물은
   모서리가 둥글지 않다. **누르는 것**(버튼·칩·세그먼트)만 `--radius-btn`(999px).
   눈으로 인쇄물과 조작을 가른다. (D13)
7. **디자인 값은 협상 대상이 아니다.** §3·§4·§6의 hex·ms·이징을 그대로 쓴다. "개선"하지 않는다.
   바닥색(`--bg`)과 여백 단위(`--gap-xl/lg/md`)는 D17 에서 정한 값이 최신이다.
8. **봉인을 우회하지 않는다.** 남의 이번 권 전보는 `telegram_envelopes` 뷰로만 읽는다. `telegrams`를 직접 조회해 본문을 꺼내는 코드를 쓰지 않는다.
9. **쓰기는 정해진 문으로만.** 전보함 생성·참여·제본·탈퇴는 서버 함수(`create_box` `join_box` `close_volume` `leave_box`)로만 한다. 테이블에 직접 INSERT 하는 것은 `telegrams` 하나뿐이다.

## 스택

- Vite + React 18 + TypeScript (strict)
- Neon: Postgres + Data API(PostgREST) + Managed Better Auth + RLS (D14)
- 배포: Cloudflare Pages, GitHub 연동 자동배포. 서버 코드 없음 — `dist/` 만 올라간다.
  **프로덕션 가지 = `claude/telegram-messenger-migration-eggni4`** → `olrw-8pt.pages.dev`.
  그 밖의 가지는 전부 미리보기 주소로만 뜬다. `main` 은 없다 —
  이 가지를 바꾸려면 Cloudflare 대시보드에서 사용자가 바꿔야 하므로, 그 전까지는
  **작업 가지를 여기로 fast-forward 하는 것이 배포다**
- 스타일: CSS 변수 + 모듈 CSS. UI 프레임워크 없음, 애니메이션 라이브러리 없음
- 사운드: Web Audio API 합성. 참나무 타건음만 실제 녹음(16.7KB)이다 — 나무는
  합성으로 나무처럼 안 들렸다 (D15). 나머지 셋은 에셋 0바이트

## 디렉터리

```
src/
  app/            셸 · 라우팅 · 탭 · 공개 화면 문지기(PublicGate — 미로그인은 곧장 체험 모드)
  features/
    auth/         가입 · 로그인
    box/          온보딩 · 생성 · 참여 · 전환 바 · 멤버
    tour/         체험 모드 안내 투어
    transmit/     타전실
    inbox/        수신함
    archive/      서가
    ritual/       만남 마감 4단계 + 제본 애니메이션
  design/
    tokens.css    §3 토큰
    colors.ts     PAPER_COLORS · COVER (§4)
    typewriters.ts 타자기 네 대 — 그림 · UI 점 · 자판 자리표 · 목소리 (D9)
    motion.css    keyframes (§6)
  lib/
    store.ts      interface BoxStore  ← 단일 인터페이스
    neonStore.ts
    guestStore.ts    체험 모드를 브라우저 안에 가둔다 (D14)
    memoryStore.ts   테스트용
    sounds.ts     §6-1
    keySamples.ts 참나무 녹음을 동기로 뜯어 쓴다 (D15)
    neon.ts       클라이언트
neon/migrations/       번호순 SQL. 손으로 DB 만지지 않는다
docs/PORTING-SPEC.md
```

## 데이터 규칙 (위반 금지)

1. **제본은 스냅샷이다.** 권을 닫을 때 발신인 이름·용지색을 그 시점 값으로 `volume_pages`에 복사한다. 나중에 이름/색을 바꿔도 과거 책은 변하지 않는다.
2. **RLS는 멤버십 기준.** `box_members`에 행이 있는 사용자만 접근. 초대 코드 조회는 RPC로만 열고 반환 컬럼을 최소화한다.
3. **표지 이미지는 Storage.** base64를 행에 넣지 않는다. URL만 저장.
4. **스키마 변경은 항상 마이그레이션 파일로.** Studio에서 직접 수정 금지.
5. **soft delete.** 전보/권 삭제는 `deleted_at`. 즉시 파기하지 않는다.

## 확정된 골격 변경 (docs/decisions.md)

포팅 도중 **아무 기능이나** 추가하지 않는다. 아래 두 가지만 예외이고, 이건 추가가 아니라
원래 컨셉의 복원이다. 그 밖의 아이디어는 7단계 이후로 미룬다.

- **D1 봉인 모드** — 남이 보낸 이번 권 전보는 만나기 전까지 봉투로만 보인다.
  발신인 용지색 + 도착 시각 + 분량(short/medium/long). 본문은 `null`.
  전보함 단위 설정(`boxes.sealed`), 기본값 봉인. **내 전보는 언제나 전문으로 보인다.**
- **D2 함께 읽기** — 만남 마감이 5단계가 된다:
  `confirm → 함께 읽기 → customize → binding → done`.
  `begin_reading()`이 이번 권의 봉인을 풀고, 한 화면에 한 통씩 넘긴다(`playReturn`).
  건너뛰기 허용. 건너뛰면 `volumes.read_together = false`로 남는다.
- **D4 완충** — 마감 권한은 현행대로 누구나. 대신 confirm 단계에
  "아직 봉인된 전보 N통이 지금 열립니다"를 띄운다. 한 번 열린 권은 다시 봉인되지 않는다.

- **D17 타전실 재편** — 읽는 순서를 제호 → 탭 → 전보함 → 타전(종이) → 보낸 전보 →
  만남 마감 → 푸터로 하나 정한다. 상자(알약·원 단추·가로줄)를 걷고 여백과 위계로
  나눈다. **타자기 사진은 손대지 않는다.** 여백을 늘리되 타전실은 여전히 한 화면이다.

미채택: 만남 일정(`meetings`), 회수·내리기 삭제 정책. 스키마에 자리를 만들지 않았다.

## 작업 순서

1. ~~스키마 + RLS + 서버 함수~~ — 완료. `neon/tests/run.sh`로 검증한다
2. ~~디자인 토큰 · 색 시스템 (§3, §4)~~ — 완료. 용지 테두리 스타일(비색상 단서) 포함
3. ~~소개 → 인증 → 온보딩(봉인함/열린함 선택) → 전보함 전환 바~~ — 완료. `pnpm ui:check`
4. ~~타전실 → 수신함(봉투 UI) → 서가~~ — 완료. `pnpm ui:check4`
5. ~~만남 마감 5단계 + 제본 애니메이션 (§6-2)~~ — 완료. `pnpm ui:check5`
6. ~~사운드 (§6-1)~~ — 완료. `pnpm sound:check`
7. **여기까지 끝난 뒤에야** 그 밖의 신기능

## 포팅과 함께 고칠 것 (기존 구현의 알려진 결함)

스키마 쪽(RLS, 0건 마감, 동시 마감, 소유자 이양)은 1단계에서 이미 해결했다.
남은 것은 전부 프런트엔드다 — 자세한 근거는 `docs/AUDIT.md` §04-3, §04-4.

- ~~표지 base64가 문서에 인라인~~ → 지금은 색 표지만. Neon 에는 Storage 가 없다 (D14)
- 상태 계층 이중 구현 → `interface BoxStore` 하나
- ~~`prefers-reduced-motion` 미지원~~ — 해결. `useReducedMotion()` 이 5.8초 타임라인을
  건너뛴다. CSS 로 애니메이션만 꺼 두면 그동안 빈 화면을 본다
- 용지색이 색 단서만 제공 → 테두리 스타일(실선/파선/이중선/점선) 추가
- ~~한글 IME 조합 중 글자 수가 튀고 타건음이 과하게 울림~~ — 해결. 타건음은 `keydown`,
  글자 수는 입력값, 자르기는 `compositionend`. 해머 자리는 `KeyboardEvent.code`
- ~~마감 완료 화면이 Promise를 동기로 취급해 "VOL.undefined"~~ — 해결. 제본은
  애니메이션과 나란히 돌고, 애니메이션이 끝날 때 결과를 기다린다
- ~~전송 실패가 조용함~~ — 해결. `catch` 하고 종이 아래에 알린다
- ~~`user-scalable=no` 제거, 폰트 self-host~~ — 완료. media query 는 아직
- `ritual.jsx`가 로드되지도 않는 `Noto Serif KR`/`Cormorant Garamond`를 씀 → Fraunces로 통일

## 명령

```bash
pnpm dev
pnpm build
pnpm typecheck
# 스키마는 Neon 콘솔 SQL Editor 에 neon/migrations/ 를 붙여넣고, 그 뒤
# Data API → Refresh schema cache 를 누른다 (자세히는 docs/SETUP.md)

neon/tests/run.sh              # RLS · 서버 함수 (Neon·Docker 불필요)
neon/tests/concurrency_test.sh # 동시 마감

pnpm auth:check                    # 세션이 제때 알려지는가 (Neon 불필요)

pnpm build && pnpm preview &       # 아래 셋은 미리보기 서버가 떠 있어야 한다
pnpm ui:check                      # 인증 · 온보딩 · 전환 바
pnpm ui:check4                     # 타전실 · 수신함(봉투) · 서가
pnpm ui:check5                     # 만남 마감 5단계 · 제본 애니메이션
pnpm sound:check                   # §6-1 합성음 (미리보기 서버 불필요)
pnpm tint:check                    # 타자기 네 대가 한눈에 다른지 (D9)
```

**스키마를 건드리면 테스트를 돌린다.** 봉인·제본·소유자 이양은 눈으로 봐서는 깨진 걸 모른다.

**`ui:check*` 는 전부 memoryStore 로 돈다** (환경변수가 없으니). Neon 어댑터 쪽 계약이
깨져도 하나도 실패하지 않는다 — 로그인해도 화면이 안 바뀌던 버그가 그렇게 통과했다.
`src/lib/neonStore.ts` 를 건드리면 `pnpm auth:check` 를 함께 돌린다.

## 커밋

`feat:` `fix:` `chore:` `db:` 접두어. 마이그레이션 커밋은 항상 `db:`.
