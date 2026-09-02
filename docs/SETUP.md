# 연결하기 — Neon · 배포

지금 앱은 **Neon 없이도 돕니다.** 환경변수가 없으면 브라우저 안의 임시 저장소로
떨어집니다. 아래를 마치면 실제 계정과 실제 DB로 바뀝니다.

처음부터 끝까지 **20분** 정도, 전부 브라우저 클릭입니다.

> **터미널은 필요 없습니다.** 코드·빌드·배포는 GitHub 에 올라간 것이 자동으로
> 처리합니다. 개발자용 로컬 실행 방법만 맨 끝 **부록**에 따로 두었습니다.
>
> 예전에는 이 문서가 Supabase 를 안내했습니다. 무료 요금제의 프로젝트 개수 제한에
> 걸려 Neon 으로 갈아탔습니다 (D14). 화면 코드는 한 줄도 바뀌지 않았습니다 —
> 바뀐 것은 `src/lib/` 의 구현체 하나와 이 문서뿐입니다.

## 0. 준비물

- **Neon 계정** — github.com 계정으로 가입됩니다. 무료 요금제에서 프로젝트를 100개까지 만듭니다
- **Cloudflare 계정** — 앱이 올라가 있는 곳입니다 (`olrw-8pt.pages.dev`)

그게 전부입니다.

---

## 1. Neon 프로젝트 만들기

1. https://console.neon.tech → **New project**
2. 값 두 가지
   - **Name** — `olrw` (아무거나)
   - **Region** — `Asia Pacific (Singapore)`. 서울도 도쿄도 없습니다. 싱가포르가 제일 가깝습니다
3. **Create** → 몇 초면 끝납니다

데이터베이스 비밀번호는 이 앱이 쓰지 않습니다. 브라우저는 접속 문자열이 아니라
HTTPS 주소로만 말합니다.

---

## 2. Data API 켜기

왼쪽 **Postgres database** → **Data API** → **Enable**.

켤 때 두 칸을 확인합니다.

| 항목 | 어떻게 |
|---|---|
| **Use Managed Better Auth** | **체크.** 가입·로그인·JWT 발급을 이게 맡습니다 |
| **Grant public schema access** | **체크.** `authenticated` 역할에 기본 권한을 걸어 줍니다 |

켜면 `pg_session_jwt` 확장이 함께 깔리고, `auth.uid()` 가 생깁니다. 스키마의 RLS
정책 열다섯 개가 전부 그 함수 하나에 걸려 있습니다 — 없으면 §3 이 그 자리에서
멈추게 해 두었습니다.

---

## 3. 스키마 올리기

먼저 SQL 을 복사합니다.

1. 이 주소를 엽니다 —
   https://github.com/stupidpoohh-tech/olrw/blob/claude/telegram-messenger-migration-eggni4/neon/migrations/0001_init.sql
2. 오른쪽 위 **복사 아이콘**(Copy raw file) 을 누릅니다

Neon 콘솔로 돌아옵니다.

3. 왼쪽 **Postgres database** → **SQL Editor**
4. 편집기 안을 클릭하고 붙여넣습니다
5. **Run**

오류 없이 끝나면 됩니다. `auth.uid() 가 없습니다` 가 뜨면 §2 를 안 켠 것입니다.

### 스키마 캐시를 새로 고칩니다 (빠뜨리기 쉽습니다)

Data API 는 표 구조를 캐시해 둡니다. 방금 만든 표들이 아직 안 보입니다.

**Postgres database** → **Data API** → **Refresh schema cache**

이걸 안 하면 앱이 `전보함을 불러오지 못했습니다` 만 반복합니다.

### 제대로 올라갔는지 확인

**Tables** 에 이 표들이 보이면 됩니다:

```
profiles   boxes   box_members   telegrams   volumes   volume_pages   join_attempts
```

---

## 4. 주소 하나 가져오기

Supabase 와 달리 **키가 없습니다.** 주소 하나면 됩니다 — 권한은 전적으로 로그인한
사람의 JWT 와 RLS 가 정합니다.

> **대시보드 첫 화면의 `Connect` 창은 쓰지 않습니다.** 거기 있는
> `postgresql://…` 는 서버가 Postgres 에 직접 붙을 때 쓰는 접속 문자열이고,
> 비밀번호가 들어 있습니다. 브라우저는 다른 주소로 말합니다. 게다가 그 창은 기본이
> **연결 풀러**(`-pooler` 가 붙은 호스트)라 그대로 고치면 틀린 주소가 나옵니다.

왼쪽 **Postgres database** → **Data API** 를 엽니다. 거기 **Data API URL** 이
그대로 적혀 있습니다. 거기서 **두 군데만 지웁니다.**

```
적혀 있는 것   https://ep-xxxx-yyyy.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1
                                  ~~~~~~~~                                          ~~~~~~~~
넣을 값        https://ep-xxxx-yyyy.c-4.ap-southeast-1.aws.neon.tech/neondb
```

| 지울 것 | 왜 |
|---|---|
| 호스트 중간의 `.apirest` | SDK 가 알아서 붙입니다 |
| 맨 끝의 `/rest/v1` | 이것도 SDK 가 붙입니다 |

리전(`c-4.ap-southeast-1.aws.neon.tech`)과 데이터베이스 이름(`/neondb`)은 그대로 둡니다.
SDK 가 이 주소 하나에서 인증 주소(`…neonauth…/auth`)와 Data API 주소
(`…apirest…/rest/v1`)를 각각 다시 만들어 씁니다.

이 값을 넣는 곳은 **Cloudflare 대시보드**입니다 — §6 에서 합니다.

> 이 주소는 공개해도 되는 값입니다. Neon API 키(`napi_…`)는 다릅니다 — 그건 계정
> 전체를 여는 열쇠라 **절대** `VITE_` 로 시작하는 이름에 넣지 않습니다. 클라이언트
> 번들에 그대로 들어가고, 앱을 여는 누구나 그것을 볼 수 있습니다.

---

## 5. 로그인 방식 정하기

왼쪽 메뉴 맨 아래쪽 **Auth** 를 클릭합니다. (`Postgres database` 목록 바깥,
`Feedback` 위입니다.)

- **Sign-up with Email** — 켭니다. 이메일+비밀번호 가입을 여는 스위치입니다
- **Verify at Sign-up** — **끄시길 권합니다** (아래 참고)

| | 켜 두면 | 꺼 두면 |
|---|---|---|
| 가입하면 | 확인 코드가 메일로 갑니다 | 바로 들어옵니다 |
| 좋은 점 | 남의 메일로 가입 못 합니다 | 넷이서 쓰기에 번거롭지 않습니다 |
| 나쁜 점 | 코드를 입력받는 화면이 앱에 아직 없습니다 | 아무 메일 주소로나 가입됩니다 |

**넷이 쓰는 사적인 전보함이면 꺼 두는 쪽을 권합니다.** 초대 코드를 아는 사람만
전보함에 들어올 수 있으니, 메일 확인이 지키는 것이 별로 없습니다. 켜 두면 가입
직후 "메일함을 확인해 주세요" 화면까지는 가지만, 코드를 넣을 칸이 없어 거기서
막힙니다 — 그 화면은 아직 만들지 않았습니다.

---

## 6. Cloudflare 에 주소 넣기

앱은 이미 Cloudflare Pages 에 올라가 있습니다. §4 에서 만든 주소를 거기에 넣어 주면
그때부터 실제 DB 로 돕니다.

1. https://dash.cloudflare.com 으로 들어갑니다
2. 왼쪽 메뉴 **Compute (Workers & Pages)** → 목록에서 **olrw** 를 클릭합니다
3. 위쪽 **Settings** 탭 → 왼쪽 **Variables and Secrets**
4. **Add** 버튼

   | 칸 | 넣을 값 |
   |---|---|
   | Type | `Text` |
   | Variable name | `VITE_NEON_URL` |
   | Value | §4 에서 만든 주소 |

5. **Save**

**같은 것을 두 번 넣습니다.** 이 화면 위쪽에 **Production** 과 **Preview** 를 고르는
자리가 있습니다. 둘은 따로 관리되므로 양쪽에 다 넣어야 합니다 — 한쪽만 넣으면
`main` 은 되는데 미리보기 주소는 안 되거나, 그 반대가 됩니다.

### 다시 배포합니다

환경변수는 **다음 빌드부터** 반영됩니다. 이미 올라간 것에는 안 붙습니다.

위쪽 **Deployments** 탭 → 맨 위 배포의 오른쪽 **⋯** → **Retry deployment**

1~2분 뒤 초록색으로 바뀌면 끝입니다.

---

## 7. 붙었는지 확인하기

배포된 주소(`https://olrw-8pt.pages.dev`)를 엽니다.

1. 아래쪽 **로그인** 링크 → **가입**
2. 전보함을 하나 만들고 초대 코드가 뜨는지 봅니다
3. Neon 콘솔로 돌아가 왼쪽 **Tables** → **boxes** 를 봅니다.
   **방금 만든 전보함이 한 줄 보이면 붙은 것입니다.**
4. 전보를 하나 타전하고 **telegrams** 에도 행이 생기는지 봅니다
5. 다른 폰(또는 시크릿 창)으로 다른 계정을 만들어 초대 코드로 참여합니다
6. **수신함에서 상대 전보가 봉투로만 보이면** 봉인이 살아 있는 것입니다

체험 모드는 로그인 없이 그대로 열립니다. 그건 서버에 닿지 않고 브라우저 안에서만
돕니다 — 체험으로 만든 전보함은 Neon 에 남지 않습니다. (D14)

---

## 8. 브라우저 출처를 좁힙니다

기본값은 **아무 도메인에서나** Data API 를 부를 수 있습니다. 개발 중에는 편하지만
쓰기 시작했으면 좁혀 둡니다.

Neon 콘솔 → 왼쪽 **Postgres database** → **Data API** → **Settings** →
**CORS allowed origins**

넣을 값:

```
https://olrw-8pt.pages.dev
```

미리보기 주소에서도 써야 한다면 그 주소도 줄을 바꿔 함께 넣습니다.
비워 두면 전부 허용입니다.

---

## 9. 표지 사진은 아직 없습니다

Neon 에는 Supabase Storage 에 대응하는 것이 없습니다. Object Storage 가 있지만
베타이고 리전이 하나뿐이며, 브라우저에서 바로 올리려면 presigned URL 을 발급할
서버가 필요한데 이 앱에는 서버 코드가 없습니다.

그래서 제본 화면이 **색 표지만** 내줍니다. 사진 버튼은 아예 그려지지 않습니다 —
누르면 실패하는 버튼을 두느니 없는 편이 낫습니다. 스키마의 `cover_kind` 는
`'photo'` 를 그대로 받아 두었으니, 나중에 올릴 곳이 생기면 화면만 붙이면 됩니다.
(D14)

---

## 막혔을 때

| 증상 | 원인 | 할 일 |
|---|---|---|
| 가입해도 Neon 에 사용자가 안 생긴다 | 환경변수를 넣고 다시 배포하지 않았다 | §6 의 **Retry deployment** |
| `전보함을 불러오지 못했습니다` | 스키마 캐시가 옛 구조를 들고 있다 | §3 의 **Refresh schema cache** |
| `auth.uid() 가 없습니다` (SQL Editor) | Data API 를 안 켰다 | §2 |
| 주소를 넣었는데 아무것도 안 붙는다 | `Connect` 창의 `-pooler` 주소를 고쳐 썼다 | §4 — **Data API** 페이지의 주소를 씁니다 |
| `권한이 없습니다. 다시 로그인해 주세요` | RLS 가 막고 있다 (정상 동작) | 로그아웃 후 다시 로그인 |
| 미리보기 주소에서만 안 된다 | Preview 쪽 환경변수가 비었다 | §6 — 양쪽에 다 넣습니다 |
| 배포 주소에서만 전부 실패한다 | CORS 출처에 그 주소가 없다 | §8 |
| 가입 직후 "메일함을 확인해 주세요" 에서 안 넘어간다 | 메일 확인이 켜져 있다 | §5 에서 끕니다 |
| 사진 표지 버튼이 안 보인다 | 정상입니다 | §9 |

어느 것에도 안 맞으면, 안 되는 **화면을 캡처해서** 그대로 물어보시면 됩니다.

---

## 스키마를 고칠 때

**콘솔에서 표를 직접 고치지 않습니다.** 새 마이그레이션 파일을 만들어 올립니다.
그래야 다음 사람이(그리고 여섯 달 뒤의 본인이) 무엇이 왜 바뀌었는지 압니다.

마이그레이션 파일 작성과 검증은 **코드 쪽 일**입니다 — 사용자가 할 일은
새 SQL 을 **SQL Editor** 에 붙여넣고 **Run**, 그다음 **Data API → Refresh schema
cache** 두 번의 클릭뿐입니다.

---

# 부록 — 로컬에서 돌려보기 (개발자용)

브라우저에서 쓰는 데에는 필요 없습니다. 코드를 직접 고칠 때만 씁니다.

```bash
git clone https://github.com/stupidpoohh-tech/olrw.git
cd olrw
pnpm install
cp .env.example .env.local     # VITE_NEON_URL 을 채운다
pnpm dev                       # http://localhost:5173
```

Vite 는 환경변수를 시작할 때 한 번만 읽습니다. `.env.local` 을 고쳤으면
`pnpm dev` 를 껐다 켭니다. 이 파일은 `.gitignore` 에 들어 있어 커밋되지 않습니다.

스키마를 고쳤으면 반드시 돌립니다 — 봉인·제본·소유자 이양은 눈으로 봐서는
깨진 걸 모릅니다.

```bash
neon/tests/run.sh              # RLS · 서버 함수 47가지
neon/tests/concurrency_test.sh # 동시 마감 5가지
```

Vercel 로 옮기고 싶다면 리포에 `vercel.json` 이 이미 들어 있습니다. Framework
Preset 은 **Vite** 로 잡히고, 환경변수는 §6 과 같은 이름 하나입니다.
