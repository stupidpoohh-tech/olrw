# OLRW — Our love, rightly written (전보함)

> 이 파일은 새 리포 **루트**에 둔다. Claude Code가 매 세션 자동으로 읽는다.
> 제품 설계 정본은 `docs/PORTING-SPEC.md`. 값에 대한 판단이 필요하면 그 문서를 따른다.

## 무엇을 만드는가

최대 4명이 초대 코드로 하나의 전보함에 모여 짧은 전보를 주고받고, 만나는 날 "만남 마감"으로 그 회차를 제본해 서가에 꽂는 앱.

## 절대 규칙

1. **채팅 기능을 넣지 않는다.** 읽음 표시, 타이핑 인디케이터, 실시간 스트림 UI 금지. 느림이 기능이다.
2. **은유를 깨지 않는다.** "메시지 전송" 아님 → "타전". 전보/인쇄/제본 어휘만 쓴다.
3. **색은 정보다.** 용지색 = 발신인, 타자기색 = 전보함. 역할 없는 색을 추가하지 않는다.
4. **정원 4명 상한을 올리지 않는다.** 의도적 제약이다. 올리면 느린 단톡방이 된다.
5. **카피는 담백한 존댓말.** 이모지·감탄사 금지. 느낌표 최소.
6. **반경 최대 6px.** 둥근 카드 금지 — 인쇄물 느낌 유지.
7. **디자인 값은 협상 대상이 아니다.** §3·§4·§6의 hex·ms·이징을 그대로 쓴다. "개선"하지 않는다.

## 스택

- Vite + React 18 + TypeScript (strict)
- Supabase: Postgres + Auth + Storage + RLS
- 배포: Vercel (GitHub 연동 자동배포). Preview = PR, Production = `main`
- 스타일: CSS 변수 + 모듈 CSS. UI 프레임워크 없음, 애니메이션 라이브러리 없음
- 사운드: Web Audio API 합성 (오디오 파일 없음)

## 디렉터리

```
src/
  app/            셸 · 라우팅 · 탭
  features/
    auth/         가입 · 로그인
    box/          온보딩 · 생성 · 참여 · 전환 바 · 멤버
    transmit/     타전실
    inbox/        수신함
    archive/      서가
    ritual/       만남 마감 4단계 + 제본 애니메이션
  design/
    tokens.css    §3 토큰
    colors.ts     PAPER_COLORS · TYPE_COLORS · COVER (§4)
    motion.css    keyframes (§6)
  lib/
    store.ts      interface BoxStore  ← 단일 인터페이스
    supabaseStore.ts
    memoryStore.ts   테스트용
    sounds.ts     §6-1
    supabase.ts   클라이언트
supabase/migrations/   번호순 SQL. 손으로 DB 만지지 않는다
docs/PORTING-SPEC.md
```

## 데이터 규칙 (위반 금지)

1. **제본은 스냅샷이다.** 권을 닫을 때 발신인 이름·용지색을 그 시점 값으로 `volume_pages`에 복사한다. 나중에 이름/색을 바꿔도 과거 책은 변하지 않는다.
2. **RLS는 멤버십 기준.** `box_members`에 행이 있는 사용자만 접근. 초대 코드 조회는 RPC로만 열고 반환 컬럼을 최소화한다.
3. **표지 이미지는 Storage.** base64를 행에 넣지 않는다. URL만 저장.
4. **스키마 변경은 항상 마이그레이션 파일로.** Studio에서 직접 수정 금지.
5. **soft delete.** 전보/권 삭제는 `deleted_at`. 즉시 파기하지 않는다.

## 작업 순서 (기능 동결 상태로 1:1 포팅 먼저)

1. 스키마 + RLS 마이그레이션
2. 디자인 토큰 · 색 시스템 (§3, §4) — 값 그대로
3. 인증 → 온보딩 → 전보함 전환 바
4. 타전실 → 수신함 → 서가
5. 만남 마감 4단계 + 제본 애니메이션 (§6-2) — 타임라인 그대로
6. 사운드 (§6-1)
7. **여기까지 끝난 뒤에야** 신기능 (§8)

포팅 도중 기능을 추가하지 않는다. 추가하면 끝나지 않는다.

## 포팅과 함께 고칠 것 (기존 구현의 알려진 결함)

- Firestore 규칙이 `signedIn()`만 검사해 느슨했음 → RLS로 제대로
- 표지 base64가 문서에 인라인 → Storage
- 상태 계층 이중 구현 → 인터페이스 하나
- `prefers-reduced-motion` 미지원 → 제본 애니메이션 스킵 경로 추가
- 용지색이 색 단서만 제공 → 테두리 스타일 등 비색상 단서 추가
- 전보 0건에서 마감이 조용히 실패 → 막고 안내
- 마감 권한이 전원에게 열려 있음 → 방장 전용 또는 동의 절차 (기획 결정 필요)

## 명령

```bash
pnpm dev
pnpm build
pnpm typecheck
supabase db push          # 로컬 → 원격 마이그레이션
supabase gen types typescript --linked > src/lib/database.types.ts
```

## 커밋

`feat:` `fix:` `chore:` `db:` 접두어. 마이그레이션 커밋은 항상 `db:`.
