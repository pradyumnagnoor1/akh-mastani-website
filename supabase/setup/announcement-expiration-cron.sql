-- Run after migration0010, with pg_cron enabled in Supabase Extensions.
-- Named schedules replace their existing definition when this setup is rerun.
select cron.schedule(
  'mastani-expiration-five-minutes',
  '*/5 * * * *',
  $$select public.purge_expired_items();$$
);
-- Prevent cron history from consuming the Free database allowance indefinitely.
-- Only this application's jobs are pruned; seven days remain for troubleshooting.
select cron.schedule(
  'mastani-cron-history-daily',
  '17 4 * * *',
  $$delete from cron.job_run_details
    where end_time < now() - interval '7 days'
      and jobid in(select jobid from cron.job where jobname like 'mastani-%');$$
);
