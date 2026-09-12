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
| 서버 코드 | `functions/auth/[[path]].js` (로그인 중계) · `functions/cover/[[path]].js` (표지 사진) |
| 표지 저장소 | Cloudflare R2 — Pages 에 `COVERS` 로 묶는다 (아래) |
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
「참여자 없는 전보함」이 어긋난다.

#### 남은 테스트 데이터를 지우려면

Neon 콘솔 → 왼쪽 **SQL Editor** 에 아래를 붙여넣는다. 실행하기 전에 **먼저 §1
만 실행해** 지워질 것이 테스트 것뿐인지 눈으로 본다. 테스트 전보함 이름은 늘
`E2E ` 로 시작하고, 테스트 계정 이름은 `E2E가` · `E2E나` · `E2E다` 다.

```sql
-- ── §1. 무엇이 지워지는지 먼저 본다 ───────────────────────────────────────
select id, name, created_at from boxes where name like 'E2E %';
select id, display_name from profiles where display_name in ('E2E가', 'E2E나', 'E2E다');

-- ── §2. 위 목록이 테스트 것뿐이라면 지운다 ────────────────────────────────
begin;
set local olrw.internal = 'on';

create temp table doomed_box on commit drop as
  select id from boxes where name like 'E2E %';

delete from volume_pages where volume_id in
  (select id from volumes where box_id in (select id from doomed_box));
delete from volumes     where box_id  in (select id from doomed_box);
delete from telegrams   where box_id  in (select id from doomed_box);
delete from box_members where box_id  in (select id from doomed_box);
delete from boxes       where id      in (select id from doomed_box);

-- 다른 전보함에 속하지 않은 테스트 프로필만 지운다
delete from profiles p
 where p.display_name in ('E2E가', 'E2E나', 'E2E다')
   and not exists (select 1 from box_members m where m.user_id = p.id);

commit;
```

Neon Auth 의 계정 자체는 이 SQL 로 지워지지 않는다. **Auth** → **Users** 에서
그 주소(`olrw-e2e-…@example.com`)를 찾아 지운다.

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
- **옛 사진 표지 여덟 장.** 새 표지는 이제 올릴 수 있다(아래). 다만 옛 권 여덟
  개의 사진은 이관 원본에 없다 — 꺼낼 때 용량 때문에 base64 를 `"photo"` 라는
  글자로 바꿨고, 그때는 올릴 곳도 없었다. 그 이미지는 옛 Firestore 에만 있다.
  되찾으려면 그 프로젝트가 아직 살아 있어야 한다. 되찾은 뒤에는 `volumes` 의
  `cover_kind`/`cover_value` 만 UPDATE 하면 된다 — 스키마는 그대로다.
- **유입·전환 계측.** 지금은 아무것도 붙어 있지 않다. Cloudflare Web Analytics
  는 대시보드 토글 하나로 켜진다.

## 표지 사진 저장소를 켜려면

`functions/cover/[[path]].js` 가 사진을 받아 Cloudflare R2 에 넣는다. 버킷이
묶이기 전까지 그 함수는 503 을 돌려주고, 앱은 그걸 보고 **사진 칸을 아예 내주지
않는다** — 함께 읽기를 다 끝낸 뒤 표지에서 막히는 일이 없도록 미리 확인한다.

1. Cloudflare 대시보드 → 왼쪽 **R2 Object Storage** → **Create bucket**
2. Bucket name 에 `olrw-covers` 를 넣고 **Create bucket**
3. 왼쪽 **Workers & Pages** → **olrw-8pt** → **Settings** → **Bindings**
4. **Add** → **R2 bucket** 을 고른다
5. Variable name 에 `COVERS`, R2 bucket 에 `olrw-covers` 를 고르고 **Save**
6. **Deployments** 탭 → 맨 위 배포의 **⋯** → **Retry deployment**
   (바인딩은 새 배포부터 붙는다)

그 버킷을 **공개(Public access)로 열지 않는다.** 사진은 함수를 거쳐서만 나가고,
파일 이름이 128비트 난수라 주소를 아는 사람만 볼 수 있다. 공개로 열면 버킷 주소
규칙만 알면 누구나 뒤질 수 있게 된다.

## 옛 문서

아래는 **옛 기록**이다. 지금 상태를 알려면 이 문서를 본다.

| 문서 | 무엇이었나 |
|---|---|
| `docs/HANDOFF-README.md` | 초기 구현을 새 프로젝트로 넘기던 인수인계 — 그 일은 끝났다 |
| `docs/MIGRATION.md` | GitHub + Supabase + Vercel 이관 계획 — 실제로는 Neon + Cloudflare 로 갔다 |
| `docs/reference/` | 옛 구현의 디자인 레퍼런스. 동작하는 앱이 아니다 |
| `docs/AUDIT.md` | 포팅 전 진단. 대부분 해결됐고 근거로만 쓴다 |
