# Database restore

Data loss/corruption is SEV-1. Preserve source, logs and snapshots; stop risky
deploys and involve DB/data owner. Objectives: **RPO <=5min**, **RTO <=60min**.
They remain unverified in AWS. Local pg_dump/pg_restore proves logical backup
usability, not WAL shipping freshness, AWS PITR timing or production RPO/RTO.

## Pre-migration backup and RDS PITR — pending

1. Explicitly select approved disposable AWS account/profile/region, source DB,
   unique NEW `stage31-restore-*` target, private subnet group, DB SG, matching
   parameter group, IAM/KMS access and test application environment. STS identity
   and resource tags must match the approval. Do not use default CLI context.
2. Read source metadata: BackupRetentionPeriod, Earliest/LatestRestorableTime,
   engine/version, encrypted storage/KMS, subnet/SG/parameters and snapshot
   status. Record UTC incident time and selected restore time. If latest available
   recovery point is over five minutes old, the RPO objective is not verified.
3. Before risky migration, explicitly create a uniquely named approved manual
   snapshot and wait until available. Do not assume snapshot request = usable backup.
4. Start a NEW instance. RDS PITR can use default network/parameter settings if
   omitted, so specify private networking and parameters deliberately:

   ```bash
   test "$QUALIFICATION_ACK" = DISPOSABLE_AWS
   case "$RESTORE_DB_ID" in stage31-restore-*) ;; *) exit 1;; esac
   test "$RESTORE_DB_ID" != "$SOURCE_DB_ID"
   aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION"
   aws rds describe-db-instances --profile "$AWS_PROFILE" --region "$AWS_REGION" \
     --db-instance-identifier "$SOURCE_DB_ID"
   aws rds restore-db-instance-to-point-in-time \
     --profile "$AWS_PROFILE" --region "$AWS_REGION" \
     --source-db-instance-identifier "$SOURCE_DB_ID" \
     --target-db-instance-identifier "$RESTORE_DB_ID" \
     --restore-time "$RESTORE_TIME_UTC" \
     --db-subnet-group-name "$RESTORE_PRIVATE_SUBNET_GROUP" \
     --vpc-security-group-ids "$RESTORE_DB_SECURITY_GROUP" \
     --db-parameter-group-name "$RESTORE_PARAMETER_GROUP" \
     --no-publicly-accessible --deletion-protection \
     --tags Key=Qualification,Value=stage31-disposable
   aws rds wait db-instance-available --profile "$AWS_PROFILE" --region "$AWS_REGION" \
     --db-instance-identifier "$RESTORE_DB_ID"
   ```

   Never combine restore-time and use-latest-restorable-time. This creates paid
   resources only after explicit approval; see [AWS PITR command reference](https://docs.aws.amazon.com/cli/latest/reference/rds/restore-db-instance-to-point-in-time.html).

5. Inspect restored endpoint/private SG/subnets/encryption/parameters/backup
   retention. Obtain authorized credentials without outputting secret JSON. Use
   correct hostname and RDS CA with `sslmode=verify-full`; verify actual TLS in
   `pg_stat_ssl`, database identity, engine and max_connections. Do not disable TLS.
6. Compare users/sessions, memberships/authorization, Days/items, reservations,
   integer expense totals/shares/balances, ready-document metadata, notifications,
   private conversations/turns/proposals and migration journal counts/fingerprints.
   Check representative row references, search generated vectors and `pg_trgm`.
   Record differences expected after the selected recovery point. S3 recovery
   is separate; PG restore does not restore object bytes.
7. Start only an isolated test API against the restored DB. Verify login/existing
   session, Trip read/RBAC/search/balances/docs and assistant privacy; no automatic
   production secret/endpoint cutover. Run migrations twice and verify journal
   hashes occur once, using the authorized migration owner, not the app DML role.
8. Measure RTO from incident declaration through usable verified application,
   not just instance availability. Record actual recovery point/data gap for RPO.
   Production cutover, if necessary, is a separate reviewed incident action with
   write reconciliation and a rollback plan.
9. Cleanup only the uniquely tagged test restore instance after evidence review,
   explicit target/account confirmation and final-snapshot decision. Deletion
   protection must be deliberately changed on that NEW target, never source.
   Do not give a generic source-deleting copy/paste command. Preserve required
   snapshots and check residual storage/costs. Report cleanup failure.

## Local logical-restore evidence

`pnpm readiness:test` creates its own DB, performs custom-format pg_dump inside
that container, creates a second database, pg_restores with exit-on-error,
compares all 20 public/Drizzle table counts + sorted-row fingerprints, reruns
migrations without journal change (15), starts an isolated restored API and
verifies session/Trip/search. Fixture includes two users, membership, Days/items,
expenses/shares, ready document metadata, notifications and applied AI proposal.
This is verified locally. Restore has not run against a real RDS instance.

Recovery sign-off requires data owner approval, authoritative application checks,
observed timings, backlog/realtime reconciliation and controlled cleanup. Escalate
missing recovery points, TLS/privilege issues or unexplained fingerprint drift.
