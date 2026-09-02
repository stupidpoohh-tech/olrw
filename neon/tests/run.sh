#!/usr/bin/env bash
# 로컬 Postgres에 마이그레이션을 적용하고 RLS·서버 함수를 검증한다.
# Neon 프로젝트도 Docker도 필요 없다. Postgres 15+ 바이너리만 있으면 된다.
#
#   neon/tests/run.sh
#
# 이미 도는 서버에 붙이려면 PGHOST/PGPORT/PGUSER 를 넘긴다:
#   PGHOST=localhost PGPORT=54322 PGUSER=postgres neon/tests/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$ROOT/neon/migrations/0001_init.sql"
HARNESS="$ROOT/neon/tests/harness.sql"
TESTS="$ROOT/neon/tests/rls_test.sql"

if [[ -n "${PGHOST:-}" ]]; then
  DB="olrw_test_$$"
  psql -v ON_ERROR_STOP=1 -q -c "create database \"$DB\";" postgres
  trap 'psql -q -c "drop database if exists \"$DB\";" postgres >/dev/null 2>&1 || true' EXIT
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HARNESS" -f "$MIG"
  psql -q -d "$DB" -f "$TESTS" 2>&1 | grep -v '^NOTICE:  ' | sed 's/^NOTICE:  //'
  exit
fi

# 일회용 클러스터를 직접 띄운다.
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[[ -x "$PGBIN/initdb" ]] || { echo "postgres 바이너리를 찾지 못했습니다. PGBIN 을 지정하세요."; exit 1; }
export PATH="$PGBIN:$PATH"

DIR="$(mktemp -d /var/tmp/olrw-test-XXXXXX)"
RUNAS=""
if [[ "$(id -u)" == "0" ]]; then RUNAS="postgres"; chown -R postgres:postgres "$DIR"; fi
run() { if [[ -n "$RUNAS" ]]; then su "$RUNAS" -c "PATH=$PGBIN:\$PATH $1"; else bash -c "$1"; fi; }

cleanup() { run "pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "initdb -D $DIR/data -U postgres -A trust" >"$DIR/initdb.log" 2>&1
run "pg_ctl -D $DIR/data -l $DIR/pg.log -o '-k $DIR -p 5599 -c listen_addresses=' -w start" >/dev/null

PSQL="psql -h $DIR -p 5599 -U postgres"
run "$PSQL -v ON_ERROR_STOP=1 -q -f $HARNESS -f $MIG"
run "$PSQL -q -f $TESTS" 2>&1 | grep -v '^NOTICE:  ' | sed 's/^NOTICE:  //'
