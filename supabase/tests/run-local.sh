#!/bin/bash
# Բազայի թեստեր տեղական Postgres-ում (Supabase-ի auth/net/storage-ի պարզ նմանակներով)
set -e
cd "$(dirname "$0")/../.."
DB=matakarar_test
psql() { su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" ; }
su postgres -c "psql -q -c 'drop database if exists $DB' -c 'create database $DB'" 2>/dev/null
{
cat <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create publication supabase_realtime;
create schema net; create table net.q (id serial, url text, body jsonb);
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $$ insert into net.q(url, body) values (url, body) returning id $$;
SQL
for f in supabase/migrations/*.sql; do
  case "$f" in *0014_cron.sql) continue;; esac
  # տեղում չկան pg_net, storage — դրանց մասերը բաց ենք թողնում
  python3 - "$f" <<'PY'
import sys,re
s=open(sys.argv[1],encoding='utf-8').read()
s=s.replace('create extension if not exists pg_net;','')
if 'storage.buckets' in s:
    a=s.index('insert into storage.buckets'); b=s.index('-- Ֆիրմայի լոգո և տվյալներ'); s=s[:a]+s[b:]
print(s)
PY
done
echo "grant usage on schema auth, net to authenticated; grant execute on function auth.uid() to authenticated; grant all on all tables in schema net to authenticated; grant all on all sequences in schema net to authenticated;"
sed "s#\\\\i supabase/seed/demo.sql#\\\\i $(pwd)/supabase/seed/demo.sql#" supabase/tests/security.sql
} | psql
