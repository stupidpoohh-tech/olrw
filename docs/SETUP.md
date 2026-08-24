# 연결하기 — Supabase · Vercel

지금 앱은 **Supabase 없이도 돕니다.** 환경변수가 없으면 브라우저 안의 임시 저장소로
떨어져서, 화면 아래에 그렇게 적혀 있습니다. 아래를 마치면 실제 계정과 실제 DB로 바뀝니다.

처음부터 끝까지 **20분** 정도, 대부분 대시보드 클릭입니다.

---

## 0. 준비물

- Supabase 계정 (github.com 계정으로 가입됩니다)
- 이 리포를 받아 둔 컴퓨터
- Node 22 와 pnpm

```bash
git clone https://github.com/stupidpoohh-tech/olrw.git
cd olrw
git checkout claude/telegram-messenger-migration-eggni4
pnpm install
```

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com/dashboard → **New project**
2. 값 세 가지
   - **Name** — `olrw` (아무거나)
   - **Database Password** — 아무 긴 문자열. **잊어버려도 됩니다**, 이 앱은 안 씁니다.
     비밀번호 관리자에 넣어 두세요. 나중에 `db push` 할 때 한 번 물어봅니다.
   - **Region** — `Northeast Asia (Seoul)`
3. **Create new project** → 1~2분 기다립니다.

---

## 2. 스키마 올리기

두 가지 방법이 있습니다. **가 쪽이 쉽습니다.**

### 가. 대시보드에 붙여넣기 (설치할 것 없음)

1. 대시보드 왼쪽 **SQL Editor** → **New query**
2. `supabase/migrations/0001_init.sql` 파일을 통째로 복사해서 붙여넣습니다
3. **Run**

`Success. No rows returned` 이 나오면 끝입니다.
아래쪽에 `[OLRW] storage.objects 에 정책을 만들 권한이 없습니다` 라는 안내가 뜨면
**§5 표지 사진**을 보세요. 그것 말고는 다 된 것입니다.

### 나. CLI 로 밀기 (앞으로 스키마를 자주 바꿀 거라면)

```bash
pnpm add -D supabase
pnpm supabase login              # 브라우저가 열립니다
pnpm supabase link --project-ref <프로젝트 ref>
pnpm supabase db push            # §1 에서 정한 DB 비밀번호를 물어봅니다
```

`<프로젝트 ref>` 는 대시보드 주소의 `.../project/` 뒤에 붙은 스무 자쯤 되는 문자열입니다.

### 제대로 올라갔는지 확인

**Table Editor** 에 이 표들이 보이면 됩니다:

```
profiles   boxes   box_members   telegrams   volumes   volume_pages   join_attempts
```

---

## 3. 열쇠 두 개 가져오기

대시보드 → **Project Settings** → **API**

| 대시보드에서 | 넣을 곳 |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` |
| **Project API keys** 의 `anon` `public` | `VITE_SUPABASE_ANON_KEY` |

리포 루트에 `.env.local` 파일을 만듭니다. `.env.example` 을 복사해서 채우면 됩니다.

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> **`service_role` 키는 절대 가져오지 마세요.** 이름이 비슷해서 헷갈리기 쉬운데,
> 그 키는 RLS 를 통째로 무시합니다. `VITE_` 로 시작하는 이름에 넣으면 앱을 여는
> 누구나 그 키를 볼 수 있습니다. 우리가 만든 잠금이 전부 무의미해집니다.
> `anon` `public` 이라고 적힌 것만 씁니다. 이 키는 공개해도 되는 키입니다 —
> RLS 가 뒤에서 막아 줍니다.

`.env.local` 은 `.gitignore` 에 들어 있어 커밋되지 않습니다.

---

## 4. 로그인 방식 정하기

대시보드 → **Authentication** → **Sign In / Providers** → **Email**

**Confirm email** 이라는 스위치가 있습니다.

| | 켜 두면 | 꺼 두면 |
|---|---|---|
| 가입하면 | 확인 메일이 갑니다. 링크를 눌러야 들어옵니다 | 바로 들어옵니다 |
| 좋은 점 | 남의 메일로 가입 못 합니다 | 넷이서 쓰기에 번거롭지 않습니다 |
| 나쁜 점 | 기본 메일 발송량이 시간당 몇 통뿐입니다 | 아무 메일 주소로나 가입됩니다 |

**넷이 쓰는 사적인 전보함이면 꺼 두는 쪽을 권합니다.** 초대 코드를 아는 사람만
전보함에 들어올 수 있으니, 메일 확인이 지키는 것이 별로 없습니다.

둘 중 무엇이든 앱은 정상 동작합니다. 켜 둔 경우 가입 직후
"메일함을 확인해 주세요" 화면이 나옵니다.

### 켜 둘 거라면 주소도 등록합니다

**Authentication** → **URL Configuration**

- **Site URL** — `http://localhost:5173` (나중에 배포하면 배포 주소로 바꿉니다)
- **Redirect URLs** — 배포 후 아래를 추가합니다
  ```
  https://<프로젝트>.vercel.app/**
  https://*-<팀이름>.vercel.app/**
  ```
  두 번째 줄은 PR 미리보기 주소용입니다. 없으면 미리보기에서 로그인이 안 됩니다.

---

## 5. 표지 사진 (§2 에서 안내가 떴을 때만)

`covers` 저장소는 마이그레이션이 알아서 만듭니다. 다만 프로젝트에 따라 **정책**만
자동으로 못 만들 수 있습니다. §2 에서 `[OLRW] storage.objects ...` 안내를 봤다면
대시보드에서 세 개를 손으로 추가합니다.

**Storage** → **Policies** → `objects` 옆 **New policy** → **For full customization**

| 이름 | Allowed operation | Target roles | 조건 |
|---|---|---|---|
| `covers_read` | SELECT | 비워 둠 | `bucket_id = 'covers'` |
| `covers_write` | INSERT | `authenticated` | `bucket_id = 'covers' and is_member((storage.foldername(name))[1]::uuid)` |
| `covers_update` | UPDATE | `authenticated` | 위와 같음 |

INSERT 는 `WITH CHECK` 칸에, SELECT 와 UPDATE 는 `USING` 칸에 넣습니다.

안 해도 앱은 돕니다 — 표지에 **색**을 고르는 건 됩니다. **사진** 표지만 안 올라갑니다.

---

## 6. 돌려보기

```bash
pnpm dev
```

http://localhost:5173 을 엽니다.

**화면 아래에 "Supabase 환경변수가 없어 브라우저 안의 임시 저장소로 돌고 있습니다"
라는 회색 글씨가 사라졌으면 붙은 것입니다.** 아직 보인다면 `.env.local` 을
저장한 뒤 `pnpm dev` 를 껐다 켜세요 — Vite 는 환경변수를 시작할 때 한 번만 읽습니다.

확인해 볼 것:

1. 가입 → 전보함 만들기 → 초대 코드가 뜬다
2. 대시보드 **Table Editor** 의 `boxes` 에 방금 만든 전보함이 보인다
3. 전보를 하나 타전하고 `telegrams` 에 행이 생기는지 본다
4. 다른 브라우저(또는 시크릿 창)로 다른 계정을 만들어 초대 코드로 참여
5. **수신함에서 상대 전보가 봉투로만 보인다** — 여기까지 되면 봉인이 살아 있는 것입니다

---

## 7. 배포 (Vercel)

1. https://vercel.com → **Add New** → **Project** → 이 리포 선택
2. Framework Preset 은 **Vite** 로 잡힙니다. Build/Output 은 그대로 둡니다
3. **Environment Variables** 에 §3 의 두 값을 넣습니다.
   **Production 과 Preview 양쪽에 다 체크**합니다
4. **Deploy**

이후 `main` 에 푸시하면 Production, PR 을 열면 Preview 주소가 자동으로 생깁니다.
SPA 라우팅 설정(`vercel.json`)은 이미 들어 있습니다.

배포가 끝나면 §4 의 **Site URL** 을 배포 주소로 바꾸고, **Redirect URLs** 도 넣습니다.

---

## 막혔을 때

| 증상 | 원인 | 할 일 |
|---|---|---|
| "Supabase 환경변수가 없어…" 가 계속 보인다 | 개발 서버가 옛 환경변수를 들고 있다 | `pnpm dev` 재시작 |
| 가입은 되는데 화면이 그대로다 | 메일 확인이 켜져 있다 | 메일함을 보거나 §4 에서 끕니다 |
| `전보함을 불러오지 못했습니다` | 스키마가 안 올라갔다 | §2 의 표 일곱 개가 있는지 확인 |
| `권한이 없습니다. 다시 로그인해 주세요` | RLS 가 막고 있다 (정상 동작) | 로그아웃 후 다시 로그인 |
| 전보함이 만들어지지 않는다 | 서버 함수가 없다 | SQL Editor 에서 `select create_box('t','ivory','steel',true);` 를 실행해 오류를 봅니다 |
| 사진 표지만 안 올라간다 | Storage 정책이 없다 | §5 |
| 미리보기 주소에서 로그인이 안 된다 | Redirect URL 미등록 | §4 의 `*-<팀이름>.vercel.app/**` |

## 스키마를 고칠 때

**대시보드에서 표를 직접 고치지 않습니다.** 새 마이그레이션 파일을 만들고 올립니다.
그래야 다음 사람이(그리고 여섯 달 뒤의 본인이) 무엇이 왜 바뀌었는지 압니다.

고치고 나면 반드시 돌립니다 — 봉인·제본·소유자 이양은 눈으로 봐서는 깨진 걸 모릅니다.

```bash
supabase/tests/run.sh
supabase/tests/concurrency_test.sh
```
