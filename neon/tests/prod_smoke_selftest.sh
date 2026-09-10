#!/usr/bin/env bash
# `prod_smoke.sql` 이 실제로 게이트 노릇을 하는지 본다.
#
#   neon/tests/prod_smoke_selftest.sh
#
# 그 SQL 은 운영 DB 를 읽기만 한다. 그래서 CI 에서는 시크릿이 있을 때만 돌고,
# 없으면 아무도 문법조차 확인하지 않는다 — 어느 날 필요해졌을 때 터진다.
#
# 여기서는 견본 데이터로 채운 일회용 Postgres 에 그것을 부어,
#   1. 앞뒤가 맞는 데이터에서는 통과하고
#   2. **일부러 어긋뜨리면 실패하는지**
# 둘 다 확인한다. 값만 찍고 끝나는 검사는 게이트가 아니다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE="$ROOT/neon/tests/prod_smoke.sql"
SAMPLE="$ROOT/neon/migration/sample/0002_legacy.sample.sql"

[[ -f "$SAMPLE" ]] || node "$ROOT/neon/migration/build.mjs" --sample >/dev/null

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[[ -x "$PGBIN/initdb" ]] || { echo "postgres 바이너리를 찾지 못했습니다. PGBIN 을 지정하세요."; exit 1; }
export PATH="$PGBIN:$PATH"

DIR="$(mktemp -d /var/tmp/olrw-smoke-XXXXXX)"
RUNAS=""
if [[ "$(id -u)" == "0" ]]; then RUNAS="postgres"; chown -R postgres:postgres "$DIR"; fi
run() { if [[ -n "$RUNAS" ]]; then su "$RUNAS" -c "PATH=$PGBIN:\$PATH $1"; else bash -c "$1"; fi; }
cleanup() { run "pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "initdb -D $DIR/data -U postgres -A trust" >"$DIR/initdb.log" 2>&1
run "pg_ctl -D $DIR/data -l $DIR/pg.log -o '-k $DIR -p 5597 -c listen_addresses=' -w start" >/dev/null
PSQL="psql -h $DIR -p 5597 -U postgres"

MIG=""; for f in "$ROOT"/neon/migrations/*.sql; do MIG="$MIG -f $f"; done
run "$PSQL -v ON_ERROR_STOP=1 -q -f $ROOT/neon/tests/harness.sql$MIG" >/dev/null

# 견본 이관 SQL 의 §1 빈칸을 가짜 uuid 로 채워 붓는다.
python3 - "$SAMPLE" "$DIR/legacy.sql" <<'PY'
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
n = [0]
def fill(_m):
    n[0] += 1
    c = str(n[0])
    return "'%s')" % (c*8 + '-' + c*4 + '-4' + c*3 + '-8' + c*3 + '-' + c*12)
s = re.sub(r'null\)(?=,?\s*--\s*← 여기에 uuid)', fill, s)
open(dst, 'w', encoding='utf-8').write(s)
PY
run "$PSQL -v ON_ERROR_STOP=1 -q -f $DIR/legacy.sql" >/dev/null

fail=0
say() { echo "$1  $2"; [[ "$1" == PASS ]] || fail=1; }

# ── 1. 앞뒤가 맞는 데이터에서는 통과한다 ────────────────────────────────────
if run "$PSQL -v ON_ERROR_STOP=1 -q -f $SMOKE" >"$DIR/ok.log" 2>&1; then
  say PASS "앞뒤가 맞는 데이터에서 통과한다"
else
  say FAIL "앞뒤가 맞는 데이터에서 통과한다"
  tail -5 "$DIR/ok.log"
fi

# ── 2. 어긋뜨리면 실패한다 ──────────────────────────────────────────────────
# 권에 적힌 쪽수만 하나 올린다. 실제 쪽은 그대로라 계산이 어긋난다.
run "$PSQL -q -c \"set olrw.internal='on'; update volumes set page_count = page_count + 1;\"" >/dev/null 2>&1
if run "$PSQL -v ON_ERROR_STOP=1 -q -f $SMOKE" >"$DIR/bad.log" 2>&1; then
  say FAIL "어긋난 데이터에서 실패한다 → 통과해 버렸다"
else
  if grep -q '앞뒤가 맞지 않습니다' "$DIR/bad.log"; then
    say PASS "어긋난 데이터에서 실패한다"
  else
    say FAIL "실패는 했으나 판정 블록이 아닌 곳에서 났다"
    tail -5 "$DIR/bad.log"
  fi
fi

# ── 3. 정말 읽기만 하는가 ───────────────────────────────────────────────────
# 읽기 전용 트랜잭션이므로 쓰기가 섞여 있으면 위에서 이미 터진다. 그래도
# 파일에 쓰기 문장이 들어오지 않았는지 눈으로도 막는다.
if grep -qiE '^\s*(insert|update|delete|truncate|alter|drop|create)\b' "$SMOKE"; then
  say FAIL "읽기 전용이어야 하는데 쓰기 문장이 있다"
else
  say PASS "쓰기 문장이 없다 (읽기 전용)"
fi

echo ""
if [[ "$fail" == 0 ]]; then echo "━━━ 전부 통과 ━━━"; else echo "━━━ 실패 ━━━"; fi
exit "$fail"
