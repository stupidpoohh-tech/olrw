# 옛 전보함 이관 — 진행 상황과 남은 일

> 파이어베이스(Firestore)에 있던 옛 전보함을 Neon 으로 옮기는 작업.
> 새 세션은 **이 문서부터** 읽는다.

## 지금까지 (2026-09-02)

| | 상태 |
|---|---|
| Cloudflare Production branch | `claude/telegram-messenger-migration-eggni4` · 자동배포 켜짐 ✅ |
| 꺼내오는 도구 `public/migrate.html` | 배포됨. 로그인 → 복사 ✅ |
| 옛 데이터 꺼내기 | **완료** → `neon/migration/legacy-export.json` ✅ |
| Neon 에 심기 | **아직** — 아래 §2 가 먼저 |

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

---

## 남은 일

### 1. 옛 uid ↔ 새 uuid 짝짓기 — **사람만 할 수 있다**

옛 파이어베이스 uid 와 새 Neon 계정 uuid 는 서로 남이다. 이걸 이어 붙이려면
네 사람이 **새 앱에서 먼저 가입**해야 한다. 그 뒤 Neon 콘솔 →
**Tables** → **profiles** 에서 uuid 를 받아 아래 표를 채운다.

| 옛 uid | 이름 | 새 Neon uuid |
|---|---|---|
| `2SNxPK1lsnQA29bKrQr2xMJrjYB2` | Dada (stupidpoohh@gmail.com) | _(가입 후)_ |
| `7CBIzZaGFMNHS9kvWeC9GFXPeRu2` | 클레어 | _(가입 후)_ |
| `vzGQa9o4k9Nozrc4nQagIrMYKPt2` | 에피 | _(가입 후)_ |
| `mIse6qtQ4OepJAzf5fl50b7M78x1` | 이유경 | _(가입 후)_ |

`예쁘다` 전보함의 VOL.3~7 에는 발신인이 `"a"` / `"b"` 로만 적힌 더 옛 형식이
섞여 있다. `a` = Dada, `b` = 에피 로 읽는다 (VOL.7 에서 같은 사람의 전보가
중간부터 실제 uid 로 바뀌는 것으로 확인).

### 2. 심는 SQL 을 쓴다

`neon/migration/legacy-export.json` + 위 표 → `neon/migration/0002_legacy.sql`.
규칙:

- **제본은 스냅샷** — `volume_pages` 에 그 시점의 이름·용지색을 그대로 박는다
  (export 의 `name` / `paper` 값을 쓴다. 지금 프로필을 참조하지 않는다).
- **쓰기는 정해진 문으로만** — 전보함 생성·참여는 `create_box` / `join_box`.
  다만 이관은 소유자·초대코드·`created_at` 을 원본 그대로 살려야 하므로,
  `security definer` 이관 함수를 하나 더 두거나 **마이그레이션 파일 안에서만**
  직접 INSERT 한다. 어느 쪽이든 앱 코드에는 그 문을 열지 않는다.
- 옛 `coupleCode`(`3LMA-5J28` 꼴)를 새 초대 코드로 그대로 쓴다 — 네 사람이
  이미 외우고 있는 값이다. 형식이 안 맞으면 그때 결정한다.
- `예쁘다` 는 `ownerUid` 가 빈 문자열이다. Dada 를 소유자로 놓는다.
- 권 번호에 구멍이 있다 (`931614` 는 vol-1, vol-3 / `예쁘다` 는 vol-3 부터).
  **메꾸지 않는다.** 옛 기록 그대로 둔다.

### 3. 확인하고 치운다

1. `neon/tests/run.sh` — 스키마 건드렸으면 반드시.
2. 새 앱에서 서가를 열어 14권이 다 보이는지, 표지색·용지색이 맞는지 눈으로.
3. **`public/migrate.html` 을 지운다.** 페이지에 그렇게 적어 두었다.

---

## 미결

- 사진 표지 14권 중 9권. Neon 에 Storage 가 없다 (D14). 색 표지로 떨어뜨릴지,
  Cloudflare R2 · Images 를 붙일지 정하지 않았다.
- 옛 앱을 언제 닫을지.
