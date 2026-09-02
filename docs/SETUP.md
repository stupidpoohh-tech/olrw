# 연결하기 — Neon · 배포

지금 앱은 **Neon 없이도 돕니다.** 환경변수가 없으면 브라우저 안의 임시 저장소로
떨어집니다. 아래를 마치면 실제 계정과 실제 DB로 바뀝니다.

처음부터 끝까지 **20분** 정도, 대부분 대시보드 클릭입니다.

> 예전에는 이 문서가 Supabase 를 안내했습니다. 무료 요금제의 프로젝트 개수 제한에
> 걸려 Neon 으로 갈아탔습니다 (D14). 화면 코드는 한 줄도 바뀌지 않았습니다 —
> 바뀐 것은 `src/lib/` 의 구현체 하나와 이 문서뿐입니다.

---

## 0. 준비물

- Neon 계정 (github.com 계정으로 가입됩니다). 무료 요금제에서 프로젝트를 100개까지 만듭니다
- 이 리포를 받아 둔 컴퓨터
- Node 22 와 pnpm

```bash
git clone https://github.com/stupidpoohh-tech/olrw.git
cd olrw
git checkout claude/telegram-messenger-migration-eggni4
pnpm install
```

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

1. 왼쪽 **SQL Editor**
2. `neon/migrations/0001_init.sql` 파일을 통째로 복사해서 붙여넣습니다
3. **Run**

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

대시보드 → **Connect**. 거기 접속 문자열에서 **호스트**와 **데이터베이스 이름**만
뽑아 `https://` 를 붙입니다.

```
접속 문자열   postgresql://user:pw@ep-xxxx-yyyy.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
넣을 값       https://ep-xxxx-yyyy.c-2.ap-southeast-1.aws.neon.tech/neondb
```

사용자 이름도, 비밀번호도, `?sslmode=...` 도 떼어냅니다. SDK 가 이 주소 하나에서
인증 주소(`…neonauth…/auth`)와 Data API 주소(`…apirest…/rest/v1`)를 각각 유도합니다.

리포 루트에 `.env.local` 을 만듭니다.

```bash
cp .env.example .env.local
```

```
VITE_NEON_URL=https://ep-xxxx-yyyy.c-2.ap-southeast-1.aws.neon.tech/neondb
```

`.env.local` 은 `.gitignore` 에 들어 있어 커밋되지 않습니다.

> 이 주소는 공개해도 되는 값입니다. Neon API 키(`napi_…`)는 다릅니다 — 그건 계정
> 전체를 여는 열쇠라 **절대** `VITE_` 로 시작하는 이름에 넣지 않습니다. 클라이언트
> 번들에 그대로 들어가고, 앱을 여는 누구나 그것을 볼 수 있습니다.

---

## 5. 로그인 방식 정하기

대시보드 → **Settings** → **Auth**

- **Sign-up with Email** — 켭니다
- **Verify at Sign-up** — 메일 확인을 요구할지 정합니다

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

## 6. 표지 사진은 아직 없습니다

Neon 에는 Supabase Storage 에 대응하는 것이 없습니다. Object Storage 가 있지만
베타이고 리전이 하나뿐이며, 브라우저에서 바로 올리려면 presigned URL 을 발급할
서버가 필요한데 이 앱에는 서버 코드가 없습니다.

그래서 제본 화면이 **색 표지만** 내줍니다. 사진 버튼은 아예 그려지지 않습니다 —
누르면 실패하는 버튼을 두느니 없는 편이 낫습니다. 스키마의 `cover_kind` 는
`'photo'` 를 그대로 받아 두었으니, 나중에 올릴 곳이 생기면 화면만 붙이면 됩니다.
(D14)

---

## 7. 돌려보기

```bash
pnpm dev
```

http://localhost:5173 을 엽니다.

붙었는지는 **가입한 계정이 Neon 에 남는지**로 봅니다. 아래 2번까지 가면 확실합니다.
안 되면 `.env.local` 을 저장한 뒤 `pnpm dev` 를 껐다 켜세요 — Vite 는 환경변수를
시작할 때 한 번만 읽습니다.

확인해 볼 것:

1. 가입 → 전보함 만들기 → 초대 코드가 뜬다
2. 대시보드 **Tables** 의 `boxes` 에 방금 만든 전보함이 보인다
3. 전보를 하나 타전하고 `telegrams` 에 행이 생기는지 본다
4. 다른 브라우저(또는 시크릿 창)로 다른 계정을 만들어 초대 코드로 참여
5. **수신함에서 상대 전보가 봉투로만 보인다** — 여기까지 되면 봉인이 살아 있는 것입니다

체험 모드는 로그인 없이 그대로 열립니다. 그건 서버에 닿지 않고 브라우저 안에서만
돕니다 — 체험으로 만든 전보함은 Neon 에 남지 않습니다. (D14)

---

## 8. 배포

> **Neon 없이 먼저 올려 봐도 됩니다.** 환경변수를 비워 둔 채로 배포하면 앱이
> 브라우저 안 저장소(`localStorage`)로 돕니다. 전 화면이 실제로 동작해서 폰으로
> 만져 보기에 충분합니다. 다만 데이터가 그 브라우저 안에만 있어 **혼자만** 쓸 수
> 있습니다 — 초대 코드를 줘도 상대 화면엔 그런 전보함이 없고, 폰과 노트북도 서로
> 남입니다. 둘이 주고받으려면 Neon 이 있어야 합니다. 나중에 환경변수 하나를 넣고
> 다시 배포하면 그때 서버로 갈아탑니다. 코드는 안 고칩니다.

전보함은 **정적 SPA** 입니다. 서버 코드가 없어서 `dist/` 를 올려 주는 곳이면
어디든 똑같이 돕니다. 아래 둘 중 편한 쪽을 고르시면 됩니다 — 리포에는 양쪽 설정이
모두 들어 있어서, 나중에 옮겨도 코드는 손댈 게 없습니다.

### 가. Cloudflare Pages

1. https://dash.cloudflare.com → **Compute (Workers & Pages)** → **Create**
   → **Pages** 탭 → **Connect to Git** → 이 리포 선택
2. 빌드 설정

   | 항목 | 값 |
   |---|---|
   | Framework preset | **None** — 목록에 Vite 는 없습니다. 골라도 두 칸을 대신 채워 줄 뿐이라 직접 적으면 됩니다 |
   | Build command | `pnpm build` |
   | Build output directory | `dist` |
   | Root directory | 비워 둠 |

3. **Environment variables** 에 §4 의 `VITE_NEON_URL` 을 넣습니다.
   **Production 과 Preview 양쪽에 다** 넣어야 합니다 — 따로 관리됩니다.
   아직 Neon 프로젝트가 없다면 **비워 둡니다** (위 참고)
4. **Save and Deploy**

Node 판본은 `.node-version`(22)이 잡아 줍니다. pnpm 은 `pnpm-lock.yaml` 을 보고
알아서 씁니다. SPA 라우팅은 `public/_redirects` 가 처리합니다.

`main` 에 푸시하면 Production, 다른 가지에 푸시하면 미리보기 주소가 생깁니다.

### 나. Vercel

1. https://vercel.com → **Add New** → **Project** → 이 리포 선택
2. Framework Preset 은 **Vite** 로 잡힙니다. Build/Output 은 그대로 둡니다
3. **Environment Variables** 에 §4 의 값을 넣습니다.
   **Production 과 Preview 양쪽에 다 체크**합니다
4. **Deploy**

SPA 라우팅은 `vercel.json` 이 처리합니다.

### 배포가 끝나면 — 브라우저 출처를 좁힙니다

기본값은 **아무 도메인에서나** Data API 를 부를 수 있습니다. 개발 중에는 편하지만
배포한 뒤에는 좁혀 둡니다.

**Postgres database** → **Data API** → **Settings** → **CORS allowed origins**

```
https://<프로젝트>.pages.dev
https://olrw-8pt.pages.dev
```

미리보기 주소에서도 써야 한다면 그 주소도 함께 넣습니다. 비워 두면 전부 허용입니다.

---

## 막혔을 때

| 증상 | 원인 | 할 일 |
|---|---|---|
| 가입해도 Neon 에 사용자가 안 생긴다 | 개발 서버가 옛 환경변수를 들고 있다 | `pnpm dev` 재시작 |
| `전보함을 불러오지 못했습니다` | 스키마 캐시가 옛 구조를 들고 있다 | §3 의 **Refresh schema cache** |
| `auth.uid() 가 없습니다` (SQL Editor) | Data API 를 안 켰다 | §2 |
| `권한이 없습니다. 다시 로그인해 주세요` | RLS 가 막고 있다 (정상 동작) | 로그아웃 후 다시 로그인 |
| 전보함이 만들어지지 않는다 | 서버 함수가 없다 | SQL Editor 에서 `select create_box('t','ivory','steel',true);` 를 실행해 오류를 봅니다 |
| 배포 주소에서만 전부 실패한다 | CORS 출처에 그 주소가 없다 | §8 맨 아래 |
| 사진 표지 버튼이 안 보인다 | 정상입니다 | §6 |

## 스키마를 고칠 때

**대시보드에서 표를 직접 고치지 않습니다.** 새 마이그레이션 파일을 만들고 올립니다.
그래야 다음 사람이(그리고 여섯 달 뒤의 본인이) 무엇이 왜 바뀌었는지 압니다.
올린 뒤에는 **Refresh schema cache** 를 잊지 않습니다.

고치고 나면 반드시 돌립니다 — 봉인·제본·소유자 이양은 눈으로 봐서는 깨진 걸 모릅니다.

```bash
neon/tests/run.sh
neon/tests/concurrency_test.sh
```
