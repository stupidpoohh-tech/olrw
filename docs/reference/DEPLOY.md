# OLRW 배포 가이드 — Firebase + Cloudflare Pages

> 여러 명이 코드로 같은 전보함(방)에 모여, 각자 로그인해 어디서든 실시간으로 전보를 주고받는 시스템을 켜는 가이드입니다. 한 사람이 전보함을 여러 개 가질 수 있고, 한 전보함에는 최대 8명이 참여합니다.

**현재 상태:** `index.html`에 Firebase 설정이 이미 들어가 있어요. 아래 단계만 마치면 바로 작동합니다.

전체 소요시간 — **약 15분**.

---

## 큰 그림

```
[A 폰/PC] ─┐                          ┌─ [B 폰/PC]
           │                          │
           └───── Cloudflare Pages ────┘
                       │
                       ↓
              ┌──────────────────┐
              │  Firebase        │
              │  • Auth (이메일)  │ ← 로그인하면 어디서든 같은 데이터
              │  • Firestore     │ ← 전보/서가 실시간 동기화
              └──────────────────┘
```

- **Email/Password Auth** — 이메일 + 비밀번호로 로그인. 어느 기기에서든 같은 계정으로 들어오면 같은 데이터.
- **초대 코드** — 한 명이 전보함을 만들면 코드(`ABCD-2345`) 발급 → 다른 사람들이 입력해 같은 전보함에 참여(최대 4명).
- **Firestore** — 전보함의 전보·서가가 참여자 모두에게 실시간 동기화.

---

## STEP 1 · Firebase 콘솔에서 마무리하기 (10분)

[Firebase 콘솔](https://console.firebase.google.com/) → 프로젝트 `our-love-rightly-written` 열기.

### 1-1. Authentication → 이메일/비밀번호 활성화
1. 왼쪽 사이드바 → **"Authentication"** → **"시작하기"**
2. 상단 **"Sign-in method"** 탭
3. **"이메일/비밀번호"** 클릭 → 첫 토글 **"사용 설정"** ON → **"저장"**
   (두 번째 토글 "이메일 링크"는 끈 채로 둬도 됩니다.)

### 1-2. Firestore Database 만들기
1. 왼쪽 사이드바 → **"Firestore Database"** → **"데이터베이스 만들기"**
2. **위치**: `asia-northeast3 (Seoul)` 선택 → **"다음"**
3. **보안 규칙**: 일단 **"테스트 모드로 시작"** 선택 → **"사용 설정"**
   (테스트 모드는 30일간 누구나 읽기/쓰기. 다음 단계에서 잠급니다.)

### 1-3. Firestore 보안 규칙 잠그기 (필수)
1. Firestore Database 상단 **"규칙"** 탭
2. 아래 내용으로 통째로 교체 → **"게시"**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isMe(uid)  { return signedIn() && request.auth.uid == uid; }

    // 사용자: 본인만 자기 문서 작성/수정. 인증된 사람은 이름 읽기 가능(참여자 이름 표시용).
    match /users/{uid} {
      allow read:   if signedIn();
      allow create: if isMe(uid);
      allow update: if isMe(uid);   // roomIds 배열도 본인이 갱신
      allow delete: if false;
    }

    // 초대 코드 → 전보함 매핑. 인증된 사람은 조회 가능(코드로 방 찾기).
    match /codes/{code} {
      allow read:   if signedIn();
      allow create: if signedIn()
                     && request.resource.data.createdBy == request.auth.uid
                     && request.resource.data.keys().hasOnly(['roomId', 'createdBy']);
      allow update: if false;
      allow delete: if signedIn();   // 마지막 멤버가 나갈 때 방과 함께 정리
    }

    // 전보함(방) — 다인원. memberUids 배열로 참여자 관리.
    match /rooms/{roomId} {
      function amMember() {
        return signedIn() && request.auth.uid in resource.data.memberUids;
      }
      // 참여(join) 후 내가 멤버가 되거나, 이미 멤버이면 쓰기 허용.
      // 코드를 알아야 roomId를 얻으므로 read는 인증 사용자에게 허용.
      allow read:   if signedIn();
      allow create: if signedIn()
                     && request.resource.data.ownerUid == request.auth.uid
                     && request.resource.data.memberUids == [request.auth.uid];
      allow update: if signedIn()
                     && (request.auth.uid in resource.data.memberUids          // 멤버의 편집/나가기
                      || request.auth.uid in request.resource.data.memberUids); // 새 멤버의 참여
      allow delete: if amMember();   // 마지막 멤버가 방 삭제

      // 전보 / 권: 방 멤버만
      function roomMember() {
        return signedIn()
          && request.auth.uid in get(/databases/$(database)/documents/rooms/$(roomId)).data.memberUids;
      }
      match /telegrams/{tgId} { allow read, write: if roomMember(); }
      match /volumes/{volId}  { allow read, write: if roomMember(); }
    }
  }
}
```

✅ Firebase 측 준비 완료. 이제 `index.html`을 새로고침하면 인증 화면이 뜨고 가입/로그인이 작동합니다.

---

## STEP 2 · 동작 확인 (2분)

1. 브라우저로 `index.html` 열기
2. **"가입"** 탭에서 본인 계정 생성
3. **"전보함 만들기"** → 이름·색 정하고 만들면 초대 코드(`ABCD-2345`) 발급 → **"코드 복사"**
4. 다른 브라우저(혹은 시크릿창)에서 같은 페이지 열어 다른 이메일로 가입
5. **"코드로 참여"** 탭에서 코드 입력 → 같은 전보함에 참여 (반복 가능, 최대 4명)
6. 각자 전보를 보내보면 실시간으로 서로의 화면에 도착 (용지 색으로 누가 보냈는지 구분)

---

## STEP 3 · Cloudflare Pages에 배포 (5분)

로컬 파일만 쓰면 같은 컴퓨터에서만 접근 가능해요. 두 분의 휴대폰에서 쓰려면 인터넷에 올려야 합니다.

### 방법 A — GitHub 연동 (추천, 푸시할 때마다 자동 재배포)
1. GitHub에 새 저장소 만들기 → 이 프로젝트 파일 전부 푸시
   - `index.html`, `app.jsx`, `auth.jsx`, `pairing.jsx`, `pickers.jsx`, `colors.jsx`, `transmit.jsx`, `archive.jsx`, `ritual.jsx`, `store.jsx`, `sounds.jsx`, `styles.css`, `assets/` 폴더
2. [Cloudflare Pages](https://dash.cloudflare.com/) → **"Workers & Pages"** → **"Create"** → **"Pages"** → **"Connect to Git"**
3. 권한 허용 → 방금 만든 저장소 선택
4. Build settings: 전부 **비워두기**(또는 framework preset: None)
5. **"Save and Deploy"** → 1~2분 대기
6. `https://olrw-xxxx.pages.dev` 같은 URL 발급

### 방법 B — 폴더 직접 업로드
1. 프로젝트 폴더 전체를 ZIP 압축
2. Cloudflare Pages → **"Create"** → **"Pages"** → **"Upload assets"**
3. 이름 입력 → ZIP 끌어놓기 → **"Deploy site"**

---

## STEP 4 · Firebase에 도메인 등록 (1분, 필수)

배포된 URL이 Firebase Auth와 통신하려면 화이트리스트에 등록해야 해요.

1. Firebase 콘솔 → **Authentication** → **"Settings"** 탭
2. **"승인된 도메인"** → **"도메인 추가"** → 배포된 URL 도메인 입력
   - 예: `olrw-xxxx.pages.dev`
3. 저장

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| 로그인 화면에서 "operation-not-allowed" | STEP 1-1을 안 함. Email/Password 활성화 필요 |
| "Missing or insufficient permissions" | STEP 1-3의 보안 규칙을 적용 안 함 또는 오타 |
| 가입은 되는데 페어링 후 전보가 안 보임 | 보안 규칙이 너무 빡빡함. 위 규칙 그대로 적용했는지 확인 |
| 배포된 사이트에서 로그인 실패 | STEP 4의 도메인 등록 안 함 |
| 콘솔에 `[OLRW] Firebase init failed` | `index.html`의 `FIREBASE_CONFIG` 키 오타 |
| `tajeonStore.mode === 'local'` | Firebase SDK 스크립트가 안 실려있음 (`window.firebase`가 없음) |

콘솔에서 `tajeonStore.mode` 입력 → `'firebase'`가 나와야 정상.

---

## 데이터 구조 (참고)

```
users/{uid}
  ├── email: "you@example.com"
  ├── displayName: "민지"
  ├── roomIds: ["r_abc123", "r_def456"]   ← 참여 중인 전보함 목록 (빈 배열이면 아직 없음)
  └── createdAt: <timestamp>

codes/{ABCD-2345}                  ← 초대 코드 → 전보함 매핑
  ├── roomId: "r_abc123"
  └── createdBy: "uid_A"

rooms/{r_abc123}
  ├── name: "퇴근길 전보함"
  ├── coupleCode: "ABCD-2345"
  ├── ownerUid: "uid_A"
  ├── memberUids: ["uid_A", "uid_B", "uid_C"]   ← 참여자(최대 4명)
  ├── members: {                               ← 참여자별 이름/색
  │     uid_A: { name: "나",   paper: "ivory",  type: "green",  joinedAt },
  │     uid_B: { name: "민서", paper: "blush",  type: "teal",   joinedAt }
  │   }
  ├── currentVol: 1
  └── createdAt: <timestamp>

rooms/{r_abc123}/telegrams/{auto-id}
  ├── from: "uid_B"              ← 보낸 사람 uid (용지 색으로 구분)
  ├── text: "..."
  ├── time: "2026-05-26T..."
  └── vol: 1

rooms/{r_abc123}/volumes/{vol-1}
  ├── vol / label / title / period / count / cover / closedAt
  └── telegrams: [{ from, name, paper, text, time }, ...]   ← 보낸 사람 이름·색 스냅샷
```

**색 규칙**
- `paper`(용지 색)은 참여자가 직접 고르며 전보함마다 다르게 지정 가능 — 모두에게 보여 발신인을 구분합니다.
- `type`(타자기 색)은 각자 자기 화면에서 전보함을 구분하는 개인 설정입니다.

---

## 비용

전부 **무료 한도 내에서 충분히 운영 가능**합니다. (두 사람만 쓰면 절대 초과 안 함)

- **Firestore (Spark 무료)** — 매일 50,000 read / 20,000 write / 1GB 저장
- **Firebase Auth** — 무제한 무료
- **Cloudflare Pages** — 무제한 무료 (개인용)

---

## 운영 팁

- **백업**: Firestore 콘솔에서 한 달에 한 번 데이터 Export 추천
- **이메일 변경**: 현재는 미지원. 새 계정으로 다시 가입 필요
- **전보함 나가기**: 앱 안에서 전보함 메뉴 → "이 전보함 나가기"로 가능. 마지막 한 명이 나가면 전보함과 코드가 함께 삭제됩니다
- **참여 인원**: 한 전보함당 최대 4명 (`store.jsx`의 `MAX_MEMBERS`에서 조정)

막히는 단계가 있으면 어디서 막혔는지 알려주세요. 함께 풀어드릴게요.
