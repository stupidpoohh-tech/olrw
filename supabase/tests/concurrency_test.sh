#!/usr/bin/env bash
# 두 사람이 동시에 "만남 마감"을 눌렀을 때를 재현한다.
#
# 참조 구현에서는 이 경로가 클라이언트 트랜잭션이라, 같은 vol 번호로 두 권이
# 생기거나 전보가 사라졌다 (docs/AUDIT.md §04). close_volume() 의 for update
# 잠금이 이를 막는지 확인한다.
#
# 기대: 한쪽만 제본에 성공하고, 다른 쪽은 '묶을 전보가 없습니다'로 깨끗이 실패한다.
#       권은 한 권, 페이지 수는 그대로, current_vol 은 2.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[[ -x "$PGBIN/initdb" ]] || { echo "postgres 바이너리를 찾지 못했습니다. PGBIN 을 지정하세요."; exit 1; }
export PATH="$PGBIN:$PATH"

DIR="$(mktemp -d /var/tmp/olrw-cc-XXXXXX)"
RUNAS=""
if [[ "$(id -u)" == "0" ]]; then RUNAS="postgres"; chown -R postgres:postgres "$DIR"; fi
run() { if [[ -n "$RUNAS" ]]; then su "$RUNAS" -c "PATH=$PGBIN:\$PATH $1"; else bash -c "$1"; fi; }
cleanup() { run "pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "initdb -D $DIR/data -U postgres -A trust" >"$DIR/initdb.log" 2>&1
run "pg_ctl -D $DIR/data -l $DIR/pg.log -o '-k $DIR -p 5598 -c listen_addresses=' -w start" >/dev/null
PSQL="psql -h $DIR -p 5598 -U postgres"
run "$PSQL -v ON_ERROR_STOP=1 -q -f $ROOT/supabase/tests/harness.sql -f $ROOT/supabase/migrations/0001_init.sql"

cat > "$DIR/setup.sql" <<'SQL'
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x','{"display_name":"나"}'),
 ('22222222-2222-2222-2222-222222222222','b@x','{"display_name":"민서"}');
set role authenticated;
select as_user('11111111-1111-1111-1111-111111111111');
select box_id as box, invite_code as code from create_box('t','ivory','steel',true) \gset
select as_user('22222222-2222-2222-2222-222222222222');
select box_name from join_box(:'code','blush','steel');
insert into telegrams (box_id,author_id,body,vol) values
 (:'box','22222222-2222-2222-2222-222222222222','하나 STOP',1),
 (:'box','22222222-2222-2222-2222-222222222222','둘 STOP',1);
reset role;
select :'box';
SQL
[[ -n "$RUNAS" ]] && chmod 644 "$DIR/setup.sql"
BOX="$(run "$PSQL -q -tA -f $DIR/setup.sql" | tail -1)"

# A: 트랜잭션을 열고 제본한 뒤 잠시 붙잡고 있는다.  B: 그 사이에 같은 마감을 시도한다.
cat > "$DIR/A.sql" <<SQL
set role authenticated;
select as_user('11111111-1111-1111-1111-111111111111');
begin;
select close_volume('$BOX','A가 닫음','color','sage',true) is not null as bound;
select pg_sleep(1.5);
commit;
SQL
cat > "$DIR/B.sql" <<SQL
set role authenticated;
select as_user('22222222-2222-2222-2222-222222222222');
select pg_sleep(0.3);
select close_volume('$BOX','B가 닫음','color','navy',true) is not null as bound;
SQL
[[ -n "$RUNAS" ]] && chmod 644 "$DIR/A.sql" "$DIR/B.sql"

run "$PSQL -q -f $DIR/A.sql" >"$DIR/a.out" 2>&1 &
run "$PSQL -q -f $DIR/B.sql" >"$DIR/b.out" 2>&1 &
wait

fail=0
say() { printf '%s  %s\n' "$([[ $1 == 0 ]] && echo PASS || { fail=1; echo FAIL; })" "$2"; }

grep -q ' t$' "$DIR/a.out" && say 0 "먼저 누른 쪽은 제본에 성공한다" || say 1 "먼저 누른 쪽은 제본에 성공한다"
grep -q '묶을 전보가 없습니다' "$DIR/b.out" && say 0 "동시에 누른 쪽은 깨끗이 실패한다" || say 1 "동시에 누른 쪽은 깨끗이 실패한다"

VOLS="$(run "$PSQL -q -tA -c 'select count(*) from volumes;'")"
PAGES="$(run "$PSQL -q -tA -c 'select page_count from volumes;'")"
CUR="$(run "$PSQL -q -tA -c 'select current_vol from boxes;'")"
[[ "$VOLS"  == 1 ]] && say 0 "권은 한 권만 만들어진다"        || say 1 "권이 $VOLS 권 만들어졌다"
[[ "$PAGES" == 2 ]] && say 0 "전보가 유실되지 않는다"          || say 1 "페이지 수가 $PAGES 다"
[[ "$CUR"   == 2 ]] && say 0 "권 번호가 한 번만 올라간다"      || say 1 "current_vol 이 $CUR 이다"

echo
[[ $fail == 0 ]] && echo "━━━ 전부 통과 ━━━" || { echo "━━━ 실패한 케이스가 있습니다 ━━━"; exit 1; }
