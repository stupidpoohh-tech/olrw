# OLRW — 이식용 설계 문서

> **Our love, rightly written** (전보함)
> 이 문서는 기존 구현(브라우저 Babel + Firebase)에서 **제품 설계만 추출**한 것입니다.
> 코드는 버리고 이 문서만 새 스택(Vite + TS + Supabase 등)으로 가져가면 됩니다.
> Claude Code의 `CLAUDE.md` 또는 초기 컨텍스트로 그대로 사용하세요.

---

## 1. 제품 개념

**한 줄:** 만나서 얘기하려고 아껴둔 말을, 전보로 보내고 책으로 묶는다.

여러 명이 초대 코드로 하나의 **전보함**에 모여, 짧은 전보를 주고받습니다.
전보는 즉시 소비되는 메시지가 아니라 **한 권(VOL)에 쌓이는 원고**입니다.
실제로 만나는 날 "만남 마감"을 하면 그 권이 **제본되어 서가에 꽂힙니다.**

### 설계 원칙 (반드시 지킬 것)

1. **느림이 기능이다.** 읽음 표시, 타이핑 인디케이터, 실시간 대화 UI를 넣지 말 것. 이 제품은 채팅이 아니다.
2. **은유를 끝까지 지킨다.** 화면·버튼·상태 문구까지 전보/인쇄/제본 어휘를 쓴다. "메시지 전송" 아님 → "타전".
3. **색은 장식이 아니라 정보다.** 용지색 = 발신인, 타자기색 = 전보함. 역할 없는 색은 추가하지 않는다.
4. **소유물처럼 다룬다.** 제본된 권은 삭제가 쉬우면 안 된다. 파괴적 동작에는 무게를 준다.

### 핵심 개념어

| 개념 | 의미 |
|---|---|
| 전보 (telegram) | 한 건의 짧은 글. `STOP`으로 문장을 끊는 전보 문법 사용 |
| 전보함 (box/room) | 코드로 참여하는 공유 공간. 최대 4명 (컨셉 보호를 위한 의도적 상한) |
| 권 (VOL) | 아직 제본되지 않은 현재 회차. 전보가 여기 쌓인다 |
| 만남 마감 | 현재 권을 닫고 제본하는 의식 |
| 서가 (archive) | 제본된 권들이 책등으로 꽂힌 책장 |
| 타전실 (transmit) | 홈. 타자기로 전보를 쓰는 곳 |
| 수신함 (inbox) | 이번 권에서 남이 보낸 전보만 모아보기 |

---

## 2. 카피 톤

- **문체:** 담백한 존댓말. 감탄사·이모지 금지. 느낌표 최소.
- **어휘:** 타전 / 송신 / 수신 / 결을 맞추다 / 금박을 새기다 / 두르다 / 제본
- **금지:** "메시지", "채팅", "전송 완료!", 이모지 아이콘, 마케팅 톤

### 실제 사용 문구 (그대로 이식 권장)

```
로딩/진행:  종이를 모으는 중 …  /  결을 맞추는 중 …
            표지를 두르는 중 …  /  금박을 새기는 중 …  /  완성
빈 상태:    아직 도착한 전보가 없습니다.
확인:       이 전보를 삭제하시겠어요?
전보함:     이름 없는 전보함 (fallback)
온보딩:     전보함을 만들어 코드를 나눠주거나, 받은 코드로 참여하세요.
```

---

## 3. 디자인 토큰

### 폰트
```
본문: Pretendard (Variable)  — 한글 UI 전반
장식: Fraunces (serif)       — 코드, VOL 번호, 책등, 금박 스탬프
body: letter-spacing: -0.005em; -webkit-font-smoothing: antialiased;
```

### 컬러 토큰
```css
:root {
  /* 화이트 & 뉴트럴 */
  --bg:           #fafaf8;
  --bg-soft:      #f4f4f0;
  --surface:      #ffffff;
  --surface-2:    #f7f7f5;
  --divider:      #ececea;
  --divider-soft: #f0f0ee;

  /* 잉크 */
  --ink:          #111111;
  --ink-soft:     #2e2e2e;
  --ink-mid:      #5b5b5b;
  --ink-faded:    #8a8a8a;
  --ink-light:    #b8b8b8;
  --ink-faint:    #d8d8d6;

  /* 액센트 — 따뜻한 단 하나의 음 (STOP, 점 표시에만) */
  --accent:       #8a3a31;
  --accent-soft:  rgba(138,58,49,0.08);

  --shadow-1:    0 1px 2px rgba(17,17,17,.04), 0 2px 8px rgba(17,17,17,.04);
  --shadow-2:    0 1px 2px rgba(17,17,17,.04), 0 6px 18px rgba(17,17,17,.06),
                 0 24px 48px rgba(17,17,17,.06);
  --shadow-deep: 0 18px 60px rgba(17,17,17,.18);

  --radius-sm: 2px;  --radius: 4px;  --radius-lg: 6px;
}
```

**반경 규칙:** 최대 6px. 둥근 카드 금지 — 종이/인쇄물 느낌을 유지한다.

---

## 4. 색 시스템 (제품의 핵심)

### 4-1. 전보 용지색 — 발신인 구분 (공개)

참여자가 **전보함마다 따로** 고른다. 모두에게 보이며, 누가 보낸 전보인지 색으로 읽힌다.

```js
PAPER_COLORS = [
  { id:'ivory',  label:'아이보리', bg:'#faf5ea', edge:'#eadfc8', ink:'#4b4335' },
  { id:'blush',  label:'블러시',   bg:'#f8eee9', edge:'#ecd7cd', ink:'#5a453d' },
  { id:'sage',   label:'세이지',   bg:'#eef1e6', edge:'#d6ddc7', ink:'#414a38' },
  { id:'powder', label:'파우더',   bg:'#eaf0f2', edge:'#d1dfe3', ink:'#3a4750' },
  { id:'lilac',  label:'라일락',   bg:'#f0ecf3', edge:'#dcd2e4', ink:'#463f52' },
  { id:'wheat',  label:'밀짚',     bg:'#f6efdb', edge:'#e6d8b8', ink:'#4e442e' },
  { id:'clay',   label:'클레이',   bg:'#f6ebe0', edge:'#e6d3c1', ink:'#544435' },
  { id:'mist',   label:'미스트',   bg:'#e9f1ec', edge:'#cee0d6', ink:'#374a41' },
]
```

`bg`=카드 배경, `edge`=테두리·점, `ink`=본문 글자색.
**채도를 올리지 말 것** — 흰 종이에 은은히 물든 정도가 의도된 값이다.

> **접근성 개선점:** 색만으로 구분하면 색약 사용자가 놓친다. 재구축 시 용지마다
> 테두리 스타일(실선/파선/이중선) 등 **비색상 단서**를 하나 더 얹을 것.

### 4-2. 타자기색 — 전보함 구분 (개인 설정)

각자 자기 화면에서 전보함마다 지정. **나만 본다.** 홈의 타자기 사진이 이 색으로 물들어
지금 어느 전보함에 있는지 즉시 알 수 있다.

구현: 원본 타자기 사진이 청록색이므로 **채도를 먼저 낮추고 hue-rotate**한다.
(채도를 안 낮추면 색이 탁하고 촌스러워진다 — 실제로 1차 시안이 그렇게 실패했음)

```js
TYPE_COLORS = [
  { id:'green', label:'세이지',     tint:'#8a9d8a', filter:'saturate(.62) brightness(1.02)' },
  { id:'teal',  label:'틸',         tint:'#6f9296', filter:'hue-rotate(18deg) saturate(.6) brightness(1.01)' },
  { id:'blue',  label:'블루그레이', tint:'#7286a0', filter:'hue-rotate(48deg) saturate(.5)' },
  { id:'plum',  label:'플럼',       tint:'#8b7793', filter:'hue-rotate(102deg) saturate(.42)' },
  { id:'rose',  label:'더스티로즈', tint:'#a8807f', filter:'hue-rotate(150deg) saturate(.5) brightness(1.02)' },
  { id:'terra', label:'테라코타',   tint:'#ab7d63', filter:'hue-rotate(178deg) saturate(.55) brightness(1.03)' },
  { id:'ochre', label:'오커',       tint:'#a9925f', filter:'hue-rotate(205deg) saturate(.55) brightness(1.05)' },
  { id:'stone', label:'스톤',       tint:'#8d8a83', filter:'saturate(.1) brightness(1.02)' },
]
```

`tint`는 UI의 점·글로우에 쓰는 대표색, `filter`는 사진에 거는 CSS 필터.

> **재구축 시 대안:** 사진 필터 대신 **SVG 타자기 일러스트**로 바꾸면 색 제어가 정확해지고
> 파일도 가벼워진다. 다만 사진의 질감이 제품 인상에 기여하므로 교체는 신중히.

### 4-3. 책 표지색 — 제본된 권

```js
COVER = {
  sage:     'linear-gradient(to right, #4d6357, #6b8577, #4d6357)',
  burgundy: 'linear-gradient(to right, #5c2118, #8b3327, #5c2118)',
  sand:     'linear-gradient(to right, #806038, #ad8a5a, #806038)',
  navy:     'linear-gradient(to right, #1e2a3a, #344862, #1e2a3a)',
  charcoal: 'linear-gradient(to right, #1f1c18, #3a3530, #1f1c18)',
}
```
가로 그라디언트가 책등의 원통형 입체감을 만든다.
사진 표지도 지원(5:7 비율 크롭). 사진 위 글자는 상하 어두운 스크림 + `text-shadow` 필수.

---

## 5. 화면 구성

```
비로그인
  └─ 인증 (가입 / 로그인)

로그인 · 전보함 없음
  └─ 온보딩: [전보함 만들기] / [코드로 참여]  — 이름 + 내 용지색 + 내 타자기색

로그인 · 전보함 있음
  ├─ 상단: 전보함 전환 바 (이름·초대코드·참여자 목록, 드롭다운)
  └─ 탭: 타전실 | 수신함 | 서가
```

### 전보함 전환 바
- 좌: 타자기색 점 + 전보함 이름 + 드롭다운 화살표
- 우: 초대 코드 (클릭 복사)
- 아래: 참여자 칩 목록 (각자 용지색 스와치 + 이름, 방장·나 표시)
- 드롭다운: 내 전보함 목록 / ＋새 전보함 / 내 색·이름 설정 / 이름 변경 / 나가기

### 타전실 (홈)
타자기 사진(내 타자기색으로 tint) + 그 아래 물려 있는 종이(내 용지색).
종이에 직접 타이핑. 아래에 이번 권 진행 상황과 **최근 송신** 목록(스크롤).

### 만남 마감 (4단계 모달)
```
confirm   이번 권 N건 · 기간 표시 → 계속?
customize 제목 입력 + 표지 선택(색 5종 또는 사진 업로드)
binding   제본 애니메이션 (5.8초, 중간 취소 불가)
done      완성된 책 + [서가로 가기]
```

---

## 6. 시그니처 인터랙션

### 6-1. 타자기 사운드 (Web Audio 합성, 오디오 파일 없음)

전부 코드로 합성한다. 에셋 0바이트.

| 함수 | 구성 |
|---|---|
| `playKey` | ① 40ms 화이트노이즈 버스트 → highpass 1200~2000Hz (타건음)<br>② triangle osc 120~160Hz → 60Hz로 exponential ramp, 80ms (해머 타격) |
| `playBell` | sine 2200Hz + 3300Hz 동시, gain 0.08/0.04 → 0.001까지 800ms 감쇠 |
| `playReturn` | 350ms 노이즈를 bandpass 800→300Hz 스윕 (캐리지 슬라이드) + 280ms 뒤 sine 80Hz 쿵 |
| `playRoll` | 600ms 저진폭 노이즈 → lowpass 600Hz (종이 굴러가는 소리) |
| `playStamp` | square osc 180→60Hz, gain 0.25 → 0.001, 100ms (도장 충격) |

구현 주의: `AudioContext`는 지연 생성하고 `suspended`면 `resume()`. 모든 호출을 `try/catch`로 감쌀 것.

### 6-2. 제본 애니메이션 (총 5.8초)

React state로 phase를 진행하고, 각 phase가 CSS 애니메이션을 발동시킨다. 라이브러리 없음.

**타임라인**
```
0.0s  phase 0  종이 12장이 사방에서 날아와 쌓임        playRoll
1.6s  phase 1  결 맞추기(정렬)
2.2s  phase 2  표지가 좌우에서 감쌈                    playRoll
3.4s  phase 3  금박 스탬프 + 흰 플래시 + 스파크 14개   playStamp
4.4s  phase 4  완성                                    playReturn
5.8s  →        onDone() — 결과 화면으로
```

**종이 날아들기**
12장 각각 시작값을 미리 뽑아 CSS 변수로 주입:
```js
pages = Array.from({length:12}).map((_, i) => ({
  delay: i * 0.06,
  x:     (Math.random()-0.5) * 420,   // --x
  y:     (Math.random()-0.5) * 380,   // --y
  rot:   (Math.random()-0.5) * 120,   // --rot  시작 회전
  final: (Math.random()-0.5) * 2.5,   // --final 착지 후 미세 어긋남
  z: i,
}))
// animation: pageFly 1.1s {delay}s cubic-bezier(.2,.8,.2,1) both
```
```css
@keyframes pageFly {
  0%   { opacity:0; transform: translate(var(--x),var(--y)) rotate(var(--rot)) scale(.6); }
  60%  { opacity:1; }
  100% { opacity:1; transform: translate(0,0) rotate(var(--final)) scale(1); }
}
```
> `--final`의 ±2.5도가 핵심이다. 완벽히 정렬하면 인쇄물이 아니라 디지털처럼 보인다.

**표지 감싸기** — 0.7s `cubic-bezier(.4,1.4,.5,1)` (오버슈트로 툭 덮이는 느낌)
```css
@keyframes coverWrapBack  { 0%{transform:translateX(-110%) rotate(-4deg)} 100%{transform:translateX(0) rotate(0)} }
@keyframes coverWrapFront { 0%{transform:translateX( 110%) rotate( 4deg)} 100%{transform:translateX(0) rotate(0)} }
```
앞표지 안쪽에 `inset:8px; border:1px solid rgba(212,184,127,.6)` 금박 테두리.

**금박 스탬프** — 0.7s `cubic-bezier(.3,1.6,.4,1)`
```css
@keyframes goldStampIn {
  0%   { opacity:0; transform:translate(-50%,-50%) scale(3)   rotate(-12deg); filter:blur(4px); }
  50%  { opacity:1; transform:translate(-50%,-50%) scale(.9)  rotate(-2deg);  filter:blur(0); }
  75%  {            transform:translate(-50%,-50%) scale(1.08) rotate(0); }
  100% {            transform:translate(-50%,-50%) scale(1)    rotate(0); }
}
```

**스파크 14개** — 극좌표로 원형 방출
```js
sparks = Array.from({length:14}).map((_, i) => ({
  angle: (Math.PI*2*i)/14 + Math.random()*0.3,
  distance: 80 + Math.random()*60,
  delay: Math.random()*0.15,
}))
// --sx: cos(angle)*distance,  --sy: sin(angle)*distance
// animation: sparkFly .9s {delay}s ease-out both
```
```css
@keyframes sparkFly {
  0%   { opacity:0; transform:translate(-50%,-50%) scale(.5); }
  10%  { opacity:1; }
  100% { opacity:0; transform:translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(.3); }
}
@keyframes flashWhite { 0%,100%{opacity:0} 15%{opacity:1} }
```
플래시는 `inset:-200px`의 `radial-gradient(circle, rgba(255,255,255,.6), transparent 60%)`, 0.5s.

**접근성:** `prefers-reduced-motion: reduce`일 때 전체 애니메이션을 건너뛰고
0.4초 페이드로 결과 화면에 바로 도달시킬 것. (기존 구현에 없던 누락 사항)

### 6-3. 그 밖의 모션
```css
@keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes stampIn { 0%{opacity:0;transform:scale(1.4) rotate(-6deg)}
                     60%{opacity:1;transform:scale(.94) rotate(-2deg)}
                     100%{transform:scale(1) rotate(0)} }   /* .45s cubic-bezier(.2,.8,.2,1) */
```
전환은 전부 0.12~0.25초. 느린 이징 금지 — 기계식 타자기는 반응이 빠르다.

---

## 7. 데이터 모델 (Supabase 기준 제안)

> 실제 구현은 Neon 위에 올라갔다. 표·정책·함수는 이 절 그대로이고, 바뀐 것은
> 프로필 생성 경로와 표지 사진뿐이다 — `docs/decisions.md` D14.

```sql
profiles      id(uuid, =auth.users) · display_name · created_at

boxes         id · name · invite_code(unique) · owner_id
              · current_vol(int, default 1) · created_at

box_members   box_id · user_id · paper_color · type_color · joined_at
              PRIMARY KEY (box_id, user_id)
              -- paper_color: 공개(발신인 구분) / type_color: 개인 설정

telegrams     id · box_id · author_id · body · vol · created_at
              · deleted_at (soft delete)

volumes       id · box_id · vol · title · cover · period · count
              · closed_at
              -- 제본 시점 스냅샷: 아래를 volume_pages로 별도 보관
volume_pages  volume_id · author_id · author_name · paper_color
              · body · sent_at · ord
```

### 반드시 지킬 규칙

1. **제본은 스냅샷이다.** 권을 닫을 때 발신인의 **이름과 용지색을 그 시점 값으로 복사**해
   `volume_pages`에 남긴다. 나중에 이름·색을 바꿔도 과거 책은 변하지 않아야 한다.
   (기존 구현도 이렇게 되어 있음 — 유지할 것)
2. **RLS는 멤버십 기준.** `box_members`에 행이 있는 사용자만 해당 박스와 하위 데이터 접근.
   초대 코드 조회만 예외적으로 열되, 반환 컬럼을 최소화한다.
   (기존 Firestore 규칙은 `signedIn()`만 검사해 느슨했음 — **이번에 반드시 고칠 것**)
3. **표지 이미지는 Storage에.** base64를 행에 넣지 말 것. URL만 저장.
   (기존 구현의 부채)
4. **스키마 버전을 둘 것.** 마이그레이션 파일로 관리하고, 앱은 버전을 확인한다.
   구조 변경으로 기존 데이터를 못 읽는 사고가 실제로 한 번 있었음.
5. **soft delete + 되돌리기.** 전보/권 삭제는 즉시 파기하지 않는다. 제품 톤과 직결된다.

---

## 8. 재구축 시 해결할 미결 사항

**기능**
- 정원이 찼을 때 방장의 내보내기 권한이 없음
- 마감(제본) 권한이 전원에게 열려 있어 합의 없이 닫힘 → 방장 전용 또는 동의 절차 필요
- 전보 0건에서 마감 시 조용히 실패
- 알림 없음 → 푸시보다 **주간 요약** 같은 느린 알림이 이 제품에 어울림
- 오프라인 처리 없음

**기획 판단이 필요한 것**
- 정원 4명은 컨셉 보호를 위한 의도적 상한이다. "만나서 아껴둔 말"은 소수의 친밀함에서만 성립하므로
  성장 압력이 있어도 상한을 올리지 말 것. 올리는 순간 느린 단톡방이 된다.

**엔지니어링**
- 상태 계층을 인터페이스 하나로 두고 구현을 갈아끼울 것 (기존엔 local/firebase 두 구현이
  한 파일에 병렬로 있어 모든 변경을 두 번 해야 했음)
- 타입 도입 (전보/권/멤버/색 id는 전부 유니온 타입으로)

---

## 9. 이식 순서 권장

```
1. 스키마 + RLS 먼저 (Supabase 마이그레이션 파일)
2. 디자인 토큰 · 색 시스템 이식 (§3, §4) — 값 그대로
3. 인증 → 온보딩 → 전보함 전환 바
4. 타전실 → 수신함 → 서가
5. 만남 마감 4단계 + 제본 애니메이션 (§6-2) — 값 그대로
6. 사운드 (§6-1)
7. 그 다음에야 §8의 새 기능
```

**기능 동결 상태로 1:1 포팅을 먼저 끝낼 것.** 이식 도중 기능을 추가하면 끝나지 않는다.
