# OLRW v1 — 지금 상태

> **이 문서가 현재 상태의 정본이다.** 다른 문서와 어긋나면 여기가 맞다.
> 설계 정본은 `docs/PORTING-SPEC.md`, 확정된 변경은 `docs/decisions.md`,
> 일하는 규칙은 `CLAUDE.md`.

## 한 줄

실제 사용자를 받아 운영 중이다. Neon 으로 옮겼고, 옛 전보함을 이관했고,
P0 두 건(봉인 우회 · 공개 저장소의 실사용 데이터)을 닫았다.

## 무엇이 어디에 있는가

| | |
|---|---|
| 앱 주소 | `https://olrw-8pt.pages.dev` |
| 프로덕션 가지 | `claude/telegram-messenger-migration-eggni4` (기본 가지) |
| 배포 | Cloudflare Pages · 프로덕션 가지 push 로 자동 |
| 데이터 | Neon Postgres + Data API(PostgREST) + Managed Better Auth + RLS (D14) |
| 서버 코드 | `functions/auth/[[path]].js` 하나 — 로그인만 우리 주소 밑으로 중계 |
| CI | `.github/workflows/release-gate.yml` |

`main` 가지는 없다. 옛 `ci.yml` 이 그것을 기다리다 한 번도 돌지 않았다.

## 끝난 것

- **Neon 전환 완료.** Supabase 는 쓰지 않는다 (D14). 파이어베이스 런타임 의존성
  없음 — 번들에 들어가지 않는다.
- **실사용 데이터 이관 완료.** 옛 전보함 둘을 옮겼다. 원본·짝짓기 값·생성된 SQL 은
  `neon/migration/local/` 에만 있고 저장소에 올라가지 않는다.
- **P0-1 닫힘.** 공개 저장소와 이력에서 실사용 데이터를 걷어냈다. 재발은
  `pnpm secrets:check` 가 막는다.
- **P0-2 닫힘.** 봉인을 `PATCH /boxes` 로 우회할 수 있던 구멍을 컬럼 권한과
  화이트리스트 트리거 두 겹으로 막았다 (`0002_seal_guard.sql`).
- **이관 도구 정리 완료.** `public/migrate.html` 삭제. 남은 것은 옮기는 규칙과
  지어낸 견본뿐이다.

## 릴리스 게이트

프로덕션 가지와 작업 가지에 밀면 돈다. 하나라도 실패하면 게이트 전체가 실패다.

| job | 무엇을 |
|---|---|
| **앱** | typecheck · build · `secrets:check` · `auth:check` · `errors:check` · `proxy:check` · `tint:check` · `sound:check` · `ui:check`×3 · 로컬 빌드 스모크 |
| **스키마** | `neon/tests/run.sh` (RLS · 서버 함수 · 봉인 회귀) · 동시 마감 |
| **이관 파이프라인** | 견본으로 생성 → 일회용 Postgres 적재 → 운영 표본 SQL 자가 시험 |
| **프로덕션 스모크** | 배포된 주소를 실제로 연다 |
| **운영 데이터 표본** | 운영 DB 를 읽기 전용으로 훑는다 (시크릿이 있을 때만) |

`live-e2e` 는 이 게이트에 들어 있지 않다. 운영 DB 에 쓰기 때문에 손으로만 돌린다.

로컬에서 같은 것을 돌리려면 `CLAUDE.md` 의 **명령** 절을 본다.

### 실제 계정으로 도는 시험 (`live-e2e`)

릴리스 게이트의 스모크는 체험 모드만 돈다 — 아래 이유로 운영 DB 에 닿지 않는다.
그래서 **브라우저 → Neon Auth → 실제 DB → RLS → 화면** 이 이어져 있는지는
그것으로 알 수 없다. 그 한 구간을 실제로 밟아 보는 것이 `live-e2e` 다.

가입 → 로그인 유지 → 전보함 생성 → 초대 → 참여 → 양쪽 타전 → 봉인 확인 →
만남 마감 5단계 → 서가 → 새로고침 → 재로그인 까지 한 바퀴를 돈다.

**운영 DB 에 실제로 쓴다.** 그래서 push 로는 돌지 않는다:

1. GitHub → 저장소 → **Actions** → 왼쪽 **live-e2e**
2. 오른쪽 **Run workflow**
3. 확인 칸에 `RUN` 을 넣고 **Run workflow**

지어낸 주소(`@example.com`)로 테스트 계정 둘을 만든다. 기존 계정·전보·참여는
건드리지 않는다. 초대 코드와 비밀번호는 로그에 찍히지 않는다.

끝나면 테스트 계정 둘과 전보함 하나가 남는다. **나가기로 지우지 않는다** —
마지막 사람이 나가면 멤버 없는 전보함이 되어 운영 표본 SQL 의
「참여자 없는 전보함」이 어긋난다. 지우려면 Neon 콘솔 SQL Editor 에서
전보함 행까지 함께 지운다.

### 프로덕션 스모크가 운영 데이터를 건드리지 않는 이유

체험 모드는 서버에 닿지 않고 브라우저 안 memoryStore 위에서만 돈다 (D14).
그래서 배포된 **프로덕션 번들**로 전보함·타전·탭 이동·인증 화면까지 돌면서도
운영 DB 에는 아무 일도 일어나지 않는다. 가입·로그인·전보 전송을 실제로 하지
않으므로 쓰레기 계정도 생기지 않는다.

실제 Neon 왕복은 `auth:check`(어댑터 계약)와 `neon/tests/run.sh`(RLS·서버 함수)가
따로 덮고, 배포된 앱으로 끝까지 도는 것은 위 `live-e2e` 가 덮는다.

### 운영 데이터 표본을 켜려면

읽기 전용 접속 문자열을 시크릿으로 넣으면 CI 가 매번 훑는다. 없으면 그 job 만
건너뛴다.

1. Neon 콘솔 → 왼쪽 **Postgres database** → **Roles** → 읽기 전용 역할을 만든다
   (없으면 기존 역할의 접속 문자열을 써도 되지만, 읽기 전용을 권한다)
2. **Connection Details** 에서 그 역할의 접속 문자열을 복사한다
3. GitHub → 저장소 → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**
4. Name 에 `NEON_READONLY_URL`, Secret 에 그 문자열을 넣고 **Add secret**

그 SQL(`neon/tests/prod_smoke.sql`)은 읽기 전용 트랜잭션으로 열고, 값을 한 번도
찍지 않는다 — 세거나 있는지 없는지만 말한다. CI 로그는 공개되기 때문이다.

## 아직 남은 것

- **GitHub dangling commit.** P0-1 에서 이력을 다시 썼지만, GitHub 은 force push
  뒤에도 옛 커밋을 한동안 URL 로 열어 준다. 저장소 소유자가 Support 에 정리를
  요청해야 사라진다. 코드로 할 수 있는 일이 아니다.
- **사진 표지.** 옛 권 여덟 개의 사진 표지는 색 표지로 들어갔다. Neon 에는
  Storage 가 없다 (D14). 붙이려면 `volumes` 의 `cover_kind`/`cover_value` 만
  UPDATE 하면 된다 — 스키마는 그대로다.
- **유입·전환 계측.** 지금은 아무것도 붙어 있지 않다. Cloudflare Web Analytics
  는 대시보드 토글 하나로 켜진다.

## 옛 문서

아래는 **옛 기록**이다. 지금 상태를 알려면 이 문서를 본다.

| 문서 | 무엇이었나 |
|---|---|
| `docs/HANDOFF-README.md` | 초기 구현을 새 프로젝트로 넘기던 인수인계 — 그 일은 끝났다 |
| `docs/MIGRATION.md` | GitHub + Supabase + Vercel 이관 계획 — 실제로는 Neon + Cloudflare 로 갔다 |
| `docs/reference/` | 옛 구현의 디자인 레퍼런스. 동작하는 앱이 아니다 |
| `docs/AUDIT.md` | 포팅 전 진단. 대부분 해결됐고 근거로만 쓴다 |
