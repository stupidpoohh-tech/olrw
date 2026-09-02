# Handoff: OLRW — Our love, rightly written (전보함)

## Overview
여러 명(최대 4명)이 초대 코드로 하나의 **전보함**에 모여 짧은 전보를 주고받고, 실제로 만나는 날 "만남 마감"으로 그 회차를 **제본**해 서가에 꽂는 앱. 채팅이 아니라 원고를 쌓는 도구다.

> **옛 기록.** 스택은 이후 Supabase 에서 Neon 으로 옮겼다 (`docs/decisions.md` D14).

이 번들의 목적: 브라우저 Babel + Firebase compat으로 만든 초기 구현을 **GitHub + Supabase + Vercel(또는 Cloudflare) 자동배포 구조로 이관**하고, 이후 작업을 **Claude Code에서 이어가는 것**.

## About the Design Files
`reference/` 안의 파일은 **디자인 레퍼런스(HTML 프로토타입)** 다. 프로덕션 코드로 그대로 복사하지 말 것. 브라우저에서 Babel로 JSX를 트랜스파일하고, Firebase compat SDK를 CDN으로 불러오고, 상태 계층이 local/firebase 두 구현으로 한 파일에 병렬 존재한다 — 전부 이관 대상이다.

해야 할 일: **Vite + React + TypeScript** 새 프로젝트에서 이 디자인을 1:1로 재구현한다. 시각 값(색·타이밍·이징·문구)은 그대로 옮기고, 구조(빌드·상태·데이터 접근)는 새로 세운다.

## Fidelity
**High-fidelity.** 색상 hex, 애니메이션 타임라인(ms 단위), 이징 커브, 사운드 합성 파라미터, 카피 문구까지 확정값이다. 픽셀 단위로 재현한다. 값의 근거와 "이렇게 하지 말 것"까지 `PORTING-SPEC.md`에 적혀 있다.

## 문서 읽는 순서
1. **`PORTING-SPEC.md`** — 제품 설계 원본. 개념, 카피 톤, 디자인 토큰, 색 시스템, 화면 구성, 시그니처 인터랙션, 데이터 모델, 미결 사항. **이게 정본이다.**
2. **`MIGRATION.md`** — 리포 생성부터 자동배포까지 실행 순서. Supabase 프로젝트, 환경변수, Vercel/Cloudflare 연결, GitHub Actions, Firebase 데이터 이관.
3. **`CLAUDE.md`** — 새 리포 루트에 그대로 복사할 Claude Code 컨텍스트 파일.
4. **`neon/migrations/0001_init.sql`** — 스키마 + RLS 초안. 이걸 첫 마이그레이션으로 커밋.

## Screens / Views
전체 명세는 `PORTING-SPEC.md` §5. 요약:

| 화면 | 목적 | 핵심 |
|---|---|---|
| 인증 | 가입 / 로그인 | Supabase Auth (이메일). 소셜은 후순위 |
| 온보딩 | 전보함 만들기 / 코드로 참여 | 이름 + 내 용지색 + 내 타자기색 |
| 전보함 전환 바 | 컨텍스트 전환 | 타자기색 점 + 이름 + 초대코드(클릭 복사) + 참여자 칩 |
| 타전실 (홈) | 전보 쓰기 | 타자기 사진(타자기색 tint) + 물려있는 종이(용지색)에 직접 타이핑 |
| 수신함 | 이번 권에서 남이 보낸 전보 | 읽음 표시 없음 |
| 서가 | 제본된 권 | 책등 진열, 사진/색 표지 |
| 만남 마감 | 권 닫기 의식 | confirm → customize → binding(5.8s) → done |

## Interactions & Behavior
`PORTING-SPEC.md` §6에 전부. 이관 시 반드시 지킬 것:
- 제본 애니메이션 총 5.8초, phase 5단계, 종이 12장 `--final` ±2.5도 어긋남
- 전환은 0.12~0.25초. 느린 이징 금지
- 사운드는 Web Audio 합성. 오디오 파일 0바이트
- `prefers-reduced-motion: reduce`면 애니메이션 건너뛰고 0.4초 페이드 (기존 구현 누락분 — 이번에 추가)

## State Management
기존 구현의 최대 부채: local/firebase 두 스토어가 한 파일에 병렬로 있어 모든 변경을 두 번 해야 했다.

새 구조: `interface BoxStore` 하나 정의하고 `SupabaseStore` 구현체만 둔다. 테스트용 `MemoryStore`는 같은 인터페이스로 별도 파일. 전보/권/멤버/색 id는 전부 유니온 타입.

## Design Tokens
`PORTING-SPEC.md` §3(뉴트럴·잉크·액센트·섀도·반경), §4(용지색 8종 / 타자기색 8종 / 표지 5종). 값 그대로 CSS 변수 + TS 상수로 옮긴다. 반경 최대 6px, 액센트는 `#8a3a31` 하나뿐.

## Assets
- 타자기 사진: `assets/` 확인 후 새 리포 `public/`으로 옮긴다. 원본이 청록색이라 `saturate()` 낮춤 → `hue-rotate()` 순서를 반드시 지킬 것 (§4-2)
- 폰트: Pretendard(본문), Fraunces(장식). CDN 대신 self-host 권장
- 아이콘·이모지 없음

## Files
```
reference/
  index.html      Babel 로더 + Firebase compat CDN + 마운트
  app.jsx         라우팅 · 탭 셸
  auth.jsx        가입/로그인
  pairing.jsx     온보딩 · 전보함 생성/참여 · 전환 바 (maxMembers = 4)
  transmit.jsx    타전실
  archive.jsx     서가
  ritual.jsx      만남 마감 4단계 + 제본 애니메이션
  pickers.jsx     용지색 / 타자기색 / 표지 선택
  colors.jsx      색 토큰 정의
  sounds.jsx      Web Audio 합성
  store.jsx       상태 계층 (local + firebase 병렬 — 이관 대상)
  styles.css      전역 스타일 · keyframes
  DEPLOY.md       구 Firebase 규칙 (참고용, 폐기 예정)
```
