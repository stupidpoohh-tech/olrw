# legacy-firebase — 구 프로젝트 잠금

이관이 끝날 때까지만 존재한다. Supabase 전환 완료 후 이 디렉터리와 Firebase 프로젝트를 함께 폐기한다.

## 지금 할 것 (수동, 2분)

1. [Firebase 콘솔](https://console.firebase.google.com/) → 프로젝트 `our-love-rightly-written`
2. **Firestore Database → 규칙** 탭
3. 내용을 `firestore.rules` 전체로 교체 → **게시**
4. 게시 직후 확인: 다른 계정으로 로그인해 `rooms` 컬렉션 조회 시 `permission-denied`가 나야 한다

## 왜 지금인가

현행 규칙은 `rooms`의 `allow update`에서 **쓰기 후 상태**(`request.resource.data.memberUids`)를 검사한다.
"새 멤버의 참여"를 허용하려던 의도였지만, 결과적으로 **자기 uid를 넣는 쓰기가 스스로를 승인**한다.
즉 로그인한 누구나 초대 코드 없이 아무 전보함에 들어가 전보 전문을 읽고 쓰고 지울 수 있다.
`allow read: if signedIn()`과 `codes` 전체 열람까지 겹쳐 있어, 가입만 하면 전부 열린다.

상세는 `docs/AUDIT.md` §01.

## 이관 중 동결되는 기능

- 코드로 새 전보함 참여
- 새 전보함 생성

기존 멤버가 기존 방에서 전보를 주고받고 제본하는 것은 그대로 동작한다.
새 전보함이 필요하면 새 Supabase 앱에서 만든다.

## 데이터 이관 여부 (미정)

`docs/decisions.md` D7 참고. 이관하기로 하면 `scripts/migrate-firebase.ts`를 1회용으로 만든다.
그 스크립트는 Admin SDK를 쓰므로 위 규칙의 영향을 받지 않는다 — **지금 잠가도 나중에 이관할 수 있다.**
