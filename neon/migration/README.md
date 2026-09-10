# 옛 전보함 이관 — 파일 배치

절차는 `docs/DATA-MIGRATION.md` 에 있다. 여기는 **어떤 파일이 어디에 있고 무엇이
저장소에 올라가지 않는지**만 적는다.

```
neon/migration/
  build.mjs                       원본 → SQL. 옮기는 규칙만 담는다 (공개)
  dryrun.sh                       일회용 Postgres 에 부어 보는 예행연습 (공개)
  sample/
    legacy-export.sample.json     견본 원본 — 값은 전부 지어낸 것 (공개)
    people.sample.json            견본 짝짓기 값 (공개)
    0002_legacy.sample.sql        견본으로 뽑은 SQL (공개)
  local/                          ← .gitignore. 저장소에 올라가지 않는다
    legacy-export.json            진짜 원본 (이메일 · 옛 uid · 전보 본문)
    people.json                   진짜 짝짓기 값 (새 계정 uuid)
    0002_legacy.sql               위 둘로 뽑은 SQL
```

## 실제 사용자 데이터는 저장소에 두지 않는다

옛 앱에서 꺼낸 원본에는 이메일 · 파이어베이스 uid · 표시 이름 · 초대 코드 ·
전보 본문이 그대로 들어 있다. 새 계정 uuid도 마찬가지다. 이 값들은 전부
`local/` 에만 두고, 그 디렉터리는 `.gitignore` 에 있다.

`build.mjs` 에는 값이 아니라 **옮기는 규칙**만 남긴다 — 옛 색 여섯 가지를 타자기
네 대로 어떻게 옮기는지, 사진 표지를 어떤 색으로 떨어뜨리는지, 권의 기간을 어디서
가져오는지. 그래서 이 파일은 공개해도 된다.

## 진짜 데이터 없이 검증하기

견본만으로 파이프라인 전체가 돈다. 공개 저장소만 받은 사람도 아래 두 줄이면
생성부터 적재까지 확인할 수 있다.

```bash
node neon/migration/build.mjs --sample   # sample/0002_legacy.sample.sql 을 만든다
neon/migration/dryrun.sh                 # local/ 이 없으면 견본으로 돈다
```

`local/` 을 갖춘 상태에서는 `--sample` 없이 돌리면 진짜 데이터로 같은 일을 한다.

## 견본은 어디까지 흉내내는가

`sample/legacy-export.sample.json` 은 원본과 **구조와 날짜 형식만** 같다. 값은 한
글자도 원본에서 오지 않았다. 다만 생성기의 까다로운 갈래는 일부러 다 담았다.

- 사진 표지 권 (색 표지로 떨어진다)
- `ownerUid` 가 빈 문자열인 전보함
- 발신인이 `a` / `b` 로만 적힌 더 옛 형식 (이름·용지색이 비어 있다)
- 제목이 `VOL.n` 라벨과 같은 권 (제목을 비운다)
- 아직 제본되지 않은 이번 권 전보
