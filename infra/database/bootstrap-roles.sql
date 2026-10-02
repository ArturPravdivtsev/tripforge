-- Operator-only, psql connected as the schema owner over verified TLS.
-- Password comes from a temporary secret environment variable, never this file.
-- Run with psql -X --set=ON_ERROR_STOP=1 --file=infra/database/bootstrap-roles.sql
-- after deploying migrations. Do not run with SQL statement logging/echo enabled.
\getenv app_password TRIPFORGE_APP_DB_PASSWORD
\if :{?app_password}
BEGIN;
CREATE ROLE tripforge_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
SELECT format('GRANT CONNECT ON DATABASE %I TO tripforge_app', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tripforge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tripforge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tripforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tripforge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tripforge_app;
COMMIT;
\else
\echo 'TRIPFORGE_APP_DB_PASSWORD must be supplied from Secrets Manager'
\quit 1
\endif
