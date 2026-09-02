# MIGRATION — GitHub + Supabase + Vercel 자동배포 이관

> **이 문서는 옛 기록이다.** 이관 당시의 계획을 남겨 둔 것이고, 실제 구성은
> Supabase 가 아니라 **Neon** 이다 (`docs/decisions.md` D14). 지금 연결하려면
> `docs/SETUP.md` 를 본다. 아래의 Supabase CLI · 환경변수 두 개 · Storage 부분은
> 더 이상 맞지 않는다.

현재: 단일 `index.html` + 브라우저 Babel + Firebase compat CDN. 빌드 없음, 배포 파이프라인 없음.
목표: 커밋하면 자동으로 배포되는 구조. Preview(PR) / Production(main) 분리.

---

## 0. 스택 선택

| 항목 | 선택 | 이유 |
|---|---|---|
| 호스팅 | **Vercel** | GitHub 연동 자동배포, PR별 Preview URL, 설정 거의 없음 |
| DB · Auth · Storage | **Supabase** | Postgres + RLS. 기존 Firestore의 느슨한 규칙 문제를 근본적으로 해결 |
| 리포 | **GitHub (private)** | Actions로 typecheck·build 게이트 |

Cloudflare Pages도 동작하지만, Vercel의 Preview URL이 4명 테스트에 더 편하다. Cloudflare를 쓸 경우 아래 §4의 대안 절을 따른다.

---

## 1. 리포 생성

```bash
mkdir olrw && cd olrw
pnpm create vite . --template react-ts
git init && git add -A && git commit -m "chore: vite + react-ts scaffold"
gh repo create olrw --private --source=. --push
```

핸드오프 번들에서 옮길 것:
```
CLAUDE.md                  → 리포 루트
PORTING-SPEC.md            → docs/PORTING-SPEC.md
neon/migrations/0001_init.sql → 그대로
reference/                 → docs/reference/   (커밋해두면 Claude Code가 디자인을 직접 읽는다)
assets/타자기 사진          → public/
```

`.gitignore`에 `.env*.local`, `node_modules`, `dist`, `.vercel` 추가.

---

## 2. Supabase 프로젝트

```bash
pnpm add @supabase/supabase-js
pnpm add -D supabase
pnpm supabase init
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push          # 0001_init.sql 적용
pnpm supabase gen types typescript --linked > src/lib/database.types.ts
```

Storage 버킷 하나: `covers` (public read, 인증 사용자만 write). 표지 이미지 업로드 경로는 `covers/{box_id}/{volume_id}.jpg`.

환경변수 (`.env.local`, 그리고 Vercel Project Settings에 같은 값):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
`service_role` 키는 **절대** `VITE_` 접두어로 두지 않는다. 클라이언트에 노출된다.

로컬 개발용 Supabase가 필요하면 `pnpm supabase start` (Docker). 초대코드 흐름 테스트에 유용.

---

## 3. Firebase 데이터 이관

기존 데이터가 실제 사용자 것이면 한 번만 돌리는 스크립트로 옮긴다. 리포에 커밋하되 `scripts/`에 격리.

```
scripts/migrate-firebase.ts
  1. Firebase Admin SDK로 users / boxes / telegrams / volumes 덤프 → JSON
  2. auth.users는 Supabase Admin API로 생성 (비밀번호는 이관 불가 → 초대 이메일로 재설정)
  3. uid → 새 uuid 매핑 테이블을 파일로 남긴다 (재실행 안전성)
  4. 표지 base64 → Storage 업로드 후 URL로 치환
  5. volume_pages는 기존 스냅샷 값을 그대로 (재계산 금지)
```
service_role 키는 로컬 `.env`에서만 읽고, 스크립트는 CI에서 돌리지 않는다.

데이터가 본인 테스트용뿐이면 이관을 생략하고 깨끗하게 시작하는 편이 빠르다.

---

## 4. Vercel 자동배포

1. vercel.com → Add New Project → GitHub 리포 선택
2. Framework Preset: Vite. Build `pnpm build`, Output `dist`
3. Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Production / Preview 양쪽에
4. 저장하면 끝. 이후 `main` 푸시 = Production, PR = Preview URL 자동 생성

SPA 라우팅용 `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Supabase Auth → URL Configuration에 Vercel 도메인과 `https://*-<team>.vercel.app` 를 Redirect URL로 등록해야 Preview에서 로그인이 된다.

**Cloudflare Pages 대안:** Connect to Git → Build `pnpm build`, Output `dist`, 환경변수 동일. SPA 폴백은 `public/_redirects`에 `/* /index.html 200`.

---

## 5. GitHub Actions 게이트

`.github/workflows/ci.yml` — 배포는 Vercel이 하고, Actions는 검증만 한다.

```yaml
name: ci
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build
```

`main`에 브랜치 보호를 걸고 이 job을 필수로 지정한다. 마이그레이션 자동 적용은 초기엔 하지 않는다 — `db push`는 손으로 돌리는 게 안전하다. 안정된 뒤에 `supabase/setup-cli` 액션으로 붙인다.

---

## 6. Claude Code로 넘어가기

```bash
cd olrw
claude
```

첫 세션에 이렇게 지시한다:

```
CLAUDE.md 와 docs/PORTING-SPEC.md 를 먼저 읽어.
docs/reference/ 는 기존 구현이고, 디자인 레퍼런스로만 쓴다. 코드를 복사하지 마.
PORTING-SPEC.md §9 순서대로 1단계부터 진행해. 각 단계 끝나면 멈추고 확인받아.
디자인 값(hex, ms, 이징, 카피)은 그대로 옮기고 바꾸지 마.
```

**컨텍스트를 넘기는 핵심은 리포에 문서로 커밋해두는 것이다.** 대화 이력은 넘어가지 않지만, `CLAUDE.md`(규칙) + `PORTING-SPEC.md`(설계) + `docs/reference/`(원본 구현)가 있으면 판단 근거가 전부 리포 안에 있다.

권장 습관:
- 결정이 생기면 `CLAUDE.md`나 `docs/decisions.md`에 한 줄로 적어 커밋한다. 다음 세션이 그걸 읽는다.
- 단계마다 브랜치를 따고 PR을 만든다. Preview URL로 4명이 실제로 써본다.
- 큰 작업은 `docs/PORTING-SPEC.md` §9의 단계 단위로 자른다. 한 세션에 두 단계를 넘기지 않는다.

디자인을 더 만들거나 고칠 일이 생기면 이쪽으로 돌아와 새 프로토타입을 만들고, 결과를 `docs/reference/`에 추가해 커밋하면 된다.

---

## 7. 체크리스트

- [ ] 리포 생성, `CLAUDE.md` + `docs/` 커밋
- [ ] Supabase 프로젝트 + `0001_init.sql` 적용 + 타입 생성
- [ ] `covers` Storage 버킷 + 정책
- [ ] Vercel 연결, 환경변수 Production/Preview 양쪽
- [ ] Supabase Auth Redirect URL에 Vercel 도메인 등록
- [ ] `ci.yml` + `main` 브랜치 보호
- [ ] (필요시) Firebase 데이터 이관 스크립트 1회 실행
- [ ] Claude Code 첫 세션: §9 1단계
