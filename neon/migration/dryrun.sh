#!/usr/bin/env bash
# 이관 SQL 을 진짜 Neon 에 붓기 전에, 일회용 Postgres 에 그대로 부어 본다.
# Neon 프로젝트도 Docker도 필요 없다. Postgres 15+ 바이너리만 있으면 된다.
#
#   neon/migration/dryrun.sh
#
# 하는 일
#   1. 빈 클러스터에 harness + 0001_init.sql 을 올린다
#   2. §1 에 적힌 사람 수만큼 profiles 를 가짜 uuid 로 만든다
#   3. 0002_legacy.sql 의 §1 빈칸을 그 uuid 로 채워 실행한다
#   4. 한 번 더 실행해 두 번 부어도 행이 늘지 않는지 확인한다
#   5. 들어간 것을 전보함별·권별로 세어 보여 준다
#
# 진짜 Neon 에 부을 때는 §1 을 콘솔에서 받은 uuid 로 사람이 채운다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HARNESS="$ROOT/neon/tests/harness.sql"
INIT="$ROOT/neon/migrations/0001_init.sql"
LEGACY="$ROOT/neon/migration/0002_legacy.sql"

[[ -f "$LEGACY" ]] || { echo "0002_legacy.sql 이 없습니다. node neon/migration/build.mjs 를 먼저 돌리세요."; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# §1 의 빈칸 수는 옮기기로 한 전보함에 따라 달라진다. 세어 보고 그만큼 만든다.
N=$(grep -c "^ *(.*null)" "$LEGACY")
[[ "$N" -ge 1 ]] || { echo "§1 에서 빈칸을 찾지 못했습니다 — 0002_legacy.sql 의 모양이 바뀌었습니다."; exit 1; }
echo "§1 에 사람 ${N}명"

# 가짜 uuid — 위에서부터 1111…, 2222… 로 채운다.
awk '
  function rep(c, n,   s, i) { s = ""; for (i = 0; i < n; i++) s = s c; return s }
  /^ +\(.*null\)/ {
    n++
    u = rep(n,8) "-" rep(n,4) "-4" rep(n,3) "-8" rep(n,3) "-" rep(n,12)
    sub(/null\)/, "\x27" u "\x27)")
  }
  { print }
' "$LEGACY" > "$WORK/legacy.sql"

if grep -q "null)" "$WORK/legacy.sql"; then
  echo "§1 의 빈칸을 다 채우지 못했습니다 — 0002_legacy.sql 의 모양이 바뀌었습니다."
  exit 1
fi

# 그 uuid 로 프로필을 만든다. 이름은 아무거나 좋다 — 서가에 뜨는 발신인 이름은
# 프로필이 아니라 제본 시점 스냅샷(volume_pages)에서 나온다.
{
  echo "insert into profiles (id, display_name) values"
  grep -o "'[0-9a-f]\{8\}-[0-9a-f-]*'" "$WORK/legacy.sql" | sort -u |
  awk '{ printf "%s  (%s, \x27사람%d\x27)", (NR>1 ? ",\n" : ""), $0, NR }'
  echo ";"
} > "$WORK/profiles.sql"

cat > "$WORK/report.sql" <<'SQL'
\pset border 2
select b.name as "전보함", b.invite_code as "초대코드", b.current_vol as "이번 권",
       (select count(*) from box_members m where m.box_id = b.id) as "참여",
       (select count(*) from telegrams t where t.box_id = b.id and t.deleted_at is null) as "이번 권 전보",
       (select count(*) from volumes v where v.box_id = b.id) as "제본된 권",
       (select coalesce(sum(v.page_count), 0) from volumes v where v.box_id = b.id) as "쪽"
from boxes b order by b.created_at;

select b.name as "전보함", v.vol as "권", coalesce(nullif(v.title, ''), '—') as "제목",
       v.cover_value as "표지",
       to_char(v.period_start at time zone 'Asia/Seoul', 'YYYY.MM.DD') || ' — ' ||
       to_char(v.period_end   at time zone 'Asia/Seoul', 'YYYY.MM.DD') as "기간",
       v.page_count as "쪽",
       (select string_agg(distinct p.author_name || '/' || p.paper_color, ' ')
          from volume_pages p where p.volume_id = v.id) as "발신인/용지색"
from volumes v join boxes b on b.id = v.box_id
order by b.created_at, v.vol;

-- 셋 다 0 이어야 한다.
--   쪽수가 어긋난 권       : 권에 적어 둔 쪽수와 실제 스냅샷 수가 다르다
--   한 권 두 색인 발신인   : 같은 권에서 한 사람이 두 용지색으로 나온다
--   빈 권                  : 스냅샷이 하나도 없는 권
select
  (select count(*) from volumes v
     where v.page_count <> (select count(*) from volume_pages p where p.volume_id = v.id))
    as "쪽수가 어긋난 권",
  (select count(*) from (
     select volume_id, author_name from volume_pages
     group by volume_id, author_name having count(distinct paper_color) > 1) x)
    as "한 권 두 색인 발신인",
  (select count(*) from volumes v
     where not exists (select 1 from volume_pages p where p.volume_id = v.id))
    as "빈 권";
SQL

if [[ -n "${PGHOST:-}" ]]; then
  DB="olrw_legacy_$$"
  psql -v ON_ERROR_STOP=1 -q -c "create database \"$DB\";" postgres
  trap 'psql -q -c "drop database if exists \"$DB\";" postgres >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HARNESS" -f "$INIT" -f "$WORK/profiles.sql"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$WORK/legacy.sql"
  echo "── 두 번째 적용 (행이 늘지 않아야 한다) ──"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$WORK/legacy.sql"
  psql -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/report.sql"
  exit
fi

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[[ -x "$PGBIN/initdb" ]] || { echo "postgres 바이너리를 찾지 못했습니다. PGBIN 을 지정하세요."; exit 1; }
export PATH="$PGBIN:$PATH"

DIR="$(mktemp -d /var/tmp/olrw-legacy-XXXXXX)"
RUNAS=""
if [[ "$(id -u)" == "0" ]]; then RUNAS="postgres"; chown -R postgres:postgres "$DIR" "$WORK"; fi
run() { if [[ -n "$RUNAS" ]]; then su "$RUNAS" -c "PATH=$PGBIN:\$PATH $1"; else bash -c "$1"; fi; }

cleanup() { run "pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR" "$WORK"; }
trap cleanup EXIT

run "initdb -D $DIR/data -U postgres -A trust" >"$DIR/initdb.log" 2>&1
run "pg_ctl -D $DIR/data -l $DIR/pg.log -o '-k $DIR -p 5598 -c listen_addresses=' -w start" >/dev/null

PSQL="psql -h $DIR -p 5598 -U postgres"
run "$PSQL -v ON_ERROR_STOP=1 -q -f $HARNESS -f $INIT -f $WORK/profiles.sql"
run "$PSQL -v ON_ERROR_STOP=1 -q -f $WORK/legacy.sql"
echo "── 두 번째 적용 (행이 늘지 않아야 한다) ──"
run "$PSQL -v ON_ERROR_STOP=1 -q -f $WORK/legacy.sql"
run "$PSQL -v ON_ERROR_STOP=1 -f $WORK/report.sql"
