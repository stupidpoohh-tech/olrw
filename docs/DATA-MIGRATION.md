# 옛 전보함 이관 — 진행 상황과 남은 일

> 파이어베이스(Firestore)에 있던 옛 전보함을 Neon 으로 옮기는 작업.
> 새 세션은 **이 문서부터** 읽는다.

## 지금까지 (2026-09-02)

| | 상태 |
|---|---|
| Cloudflare Production branch | `claude/telegram-messenger-migration-eggni4` · 자동배포 켜짐 ✅ |
| 꺼내오는 도구 `public/migrate.html` | 배포됨. 로그인 → 복사 ✅ |
| 옛 데이터 꺼내기 | **완료** → `neon/migration/legacy-export.json` ✅ |
| 심는 SQL | **완료** → `neon/migration/0002_legacy.sql` ✅ |
| 일회용 Postgres 에 부어 보기 | **통과** — 117통이 그대로, 두 번 부어도 안 늘어난다 ✅ |
| 옛 uid ↔ 새 uuid 짝짓기 | **아직** — 네 사람이 새 앱에 가입해야 한다 (§1) |
| 진짜 Neon 에 심기 | **아직** — §1 다음 (§2) |

### 꺼낸 것 (원본 확인 완료)

```
전보함 4 · 이번 권 전보 1 · 제본된 권 14 · 제본된 전보 117 · 참여자 4
  Def.clar   3권 34통   (Dada · 클레어 · 에피)
  예쁘다     7권 75통   (Dada · 에피)
  931614     2권  4통   (Dada · 이유경)
  희뜌다     2권  4통   (Dada 혼자)
```

`legacy-export.json` 은 원본 그대로다. 딱 하나 바꾼 것: 표지 사진의
base64(`data:image/jpeg;…`)를 `"photo"` 로 줄였다. Neon 에는 Storage 가 없어
어차피 색 표지만 쓴다 (D14). 사진 표지가 필요해지면 그때 다시 꺼낸다 —
`migrate.html` 을 지우기 전이라면 언제든.

### 심는 SQL

```
neon/migration/
  legacy-export.json   원본 (손대지 않는다)
  build.mjs            원본 → SQL 을 뽑는 스크립트. 판단이 담긴 곳은 여기다
  0002_legacy.sql      뽑아낸 결과. 손으로 고치지 않는다 (§1 의 uuid 네 줄만 예외)
  dryrun.sh            일회용 Postgres 에 그대로 부어 보는 예행연습
```

`0002_legacy.sql` 은 테이블에 직접 INSERT 한다. 이관은 소유자·초대코드·`created_at`
을 원본 그대로 살려야 해서 `create_box` / `join_box` 로는 할 수 없다. **앱 코드에는
그 문을 열지 않는다** — 마이그레이션 파일 안에서만이다.

모든 id 를 옛 id 에서 결정론적으로 뽑고(같은 원본 → 같은 uuid), INSERT 는 전부
`on conflict do nothing` 이다. 두 번 부어도 행이 늘지 않는다 — 예행연습에서 확인했다.

---

## 남은 일

### 1. 옛 uid ↔ 새 uuid 짝짓기 — **사람만 할 수 있다**

옛 파이어베이스 uid 와 새 Neon 계정 uuid 는 서로 남이다. 이걸 이어 붙이려면
네 사람이 **새 앱에서 먼저 가입**해야 한다.

**1) 네 사람이 새 앱에서 가입을 마친다.**

**2) uuid 를 받는다.** Neon 콘솔 → 왼쪽 **Postgres database** → **Tables** →
`profiles`. `display_name` 으로 사람을 찾고 `id` 를 복사한다.

**3) `neon/migration/0002_legacy.sql` 을 열어 §1 의 `null` 네 개를 채운다.**
그 파일에서 사람이 손대는 곳은 여기뿐이다.

| 옛 uid | 이름 | 새 Neon uuid |
|---|---|---|
| `2SNxPK1lsnQA29bKrQr2xMJrjYB2` | Dada (stupidpoohh@gmail.com) | _(가입 후)_ |
| `7CBIzZaGFMNHS9kvWeC9GFXPeRu2` | 클레어 | _(가입 후)_ |
| `vzGQa9o4k9Nozrc4nQagIrMYKPt2` | 에피 | _(가입 후)_ |
| `mIse6qtQ4OepJAzf5fl50b7M78x1` | 이유경 | _(가입 후)_ |

빠뜨리면 SQL 이 첫 문장에서 멈추고 누가 비었는지 알려준다. 가입하지 않은 사람이
있어도 마찬가지다.

### 2. Neon 에 심는다

Neon 콘솔 → 왼쪽 **Postgres database** → **SQL Editor** 에
`neon/migration/0002_legacy.sql` 전체를 붙여넣고 **Run**.

- **파일 전체를 한 번에** 붙여넣는다. 조각내서 돌리지 않는다.
- 다 되면 아래쪽에 `전보함 4 · 참여 8 · 이번 권 전보 1 · 제본된 권 14 · 제본된 전보 117`
  이 뜬다. 숫자가 모자라면 SQL 이 스스로 되돌린다 — 반쯤 들어간 상태로 남지 않는다.
- 스키마를 건드리지 않으므로 **Refresh schema cache 는 누르지 않아도 된다.**

### 3. 확인하고 치운다

1. 새 앱에서 서가를 열어 14권이 다 보이는지, 표지색·용지색이 맞는지 눈으로.
2. `Def.clar` 의 이번 권(VOL.4)에 Dada 의 전보 한 통이 있는지.
3. **`public/migrate.html` 을 지운다.** 페이지에 그렇게 적어 두었다.

---

## 옮기면서 정한 것

옛 앱과 새 앱의 어휘가 달라 그대로 옮길 수 없는 자리들이다. 근거는 전부
`neon/migration/build.mjs` 의 주석에 같이 적었고, 값을 바꾸려면 그 스크립트를
고쳐 다시 뽑는다.

| 자리 | 어떻게 했나 |
|---|---|
| 초대 코드 | 옛 `coupleCode` 를 그대로 쓴다. 네 개 모두 새 형식(혼동 문자 I O 0 1 제외)에 맞는다 |
| `예쁘다` 의 소유자 | 옛 `ownerUid` 가 빈 문자열이라 Dada 를 놓았다 |
| 권 번호의 구멍 | 메꾸지 않는다 (`931614` 는 1·3권, `예쁘다` 는 3권부터) |
| 봉인 | 기본값 그대로 `true` (D1) |
| 타자기 | 옛 여섯 색 → 네 대. violet·rose→설탕, blue→강철, green·teal→이끼, ochre→참나무. 개인 설정이라 앱에서 바꿀 수 있다 (D9) |
| 용지색 | 원본 그대로. 공개 정보이고 발신인을 가리키는 값이다 |
| 사진 표지 9권 | 색 표지 `sage` 로 떨어뜨렸다. 어느 권이었는지는 `0002_legacy.sql` 머리말에 목록으로 남겼다 |
| 권의 기간 | `close_volume()` 과 같게 첫 전보·마지막 전보의 시각. 원본의 기간 문자열과 날짜가 14권 모두 일치하는 것을 확인했다 |
| 페이지 시각 | 옛 기록에 `07.21 15:16` 처럼 연도가 없다. 연도는 그 권의 기간에서, 시간대는 KST 로 읽었다 |
| 권 제목 | 옛 제목이 `VOL.n` 라벨과 같으면 비운다 — 서가가 `VOL.n` 을 따로 그려서 두 번 찍힌다 |
| `read_together` | `true`. 옛 앱에는 '함께 읽기' 단계가 없었다(D2 는 새 결정). `false` 로 두면 옛 책 열네 권마다 "함께 읽기를 건너뛰고 제본했습니다" 가 찍힌다 |
| `예쁘다` VOL.3~7 의 `a` / `b` | `a`=Dada, `b`=에피. VOL.7 에서 `a` 의 전보가 07.21 13:20 에 끊기고 같은 날 저녁부터 Dada 의 실제 uid 로 이어진다. VOL.7 의 `a` 행에만 남아 있던 이름 `?` · 용지 `ivory` 도 Dada/powder 로 통일했다 — 그대로 두면 그 권에서만 한 사람이 두 색으로 보인다 |

## 미결

- **사진 표지 14권 중 9권.** Neon 에는 Storage 가 없다 (D14). 지금은 색 표지로
  들어간다. Cloudflare R2 · Images 를 붙일지 정하지 않았다. 붙이면 스키마는 그대로
  두고 `volumes` 의 `cover_kind` / `cover_value` 만 UPDATE 하면 된다.
- 옛 앱을 언제 닫을지.

---

## 개발자용 부록

```bash
node neon/migration/build.mjs   # legacy-export.json → 0002_legacy.sql
neon/migration/dryrun.sh        # 일회용 Postgres 에 부어 보고 세어 본다
```

`dryrun.sh` 는 §1 의 빈칸을 가짜 uuid 로 채워 돌린다. 스키마(`0001_init.sql`)를
올리고, 프로필 넷을 만들고, 이관 SQL 을 **두 번** 부은 뒤 전보함별·권별로 세어
보여 준다. 마지막 표의 세 숫자(쪽수가 어긋난 권 · 한 권 두 색인 발신인 · 빈 권)는
전부 0 이어야 한다.
