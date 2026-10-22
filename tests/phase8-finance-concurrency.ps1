$ErrorActionPreference='Stop'
$userId=[guid]::NewGuid().ToString()
$operationId=[guid]::NewGuid().ToString()
function RunSql([string]$sql) {
 $output=$sql | docker exec -i supabase_db_PrintFlowPRO psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At
 if($LASTEXITCODE -ne 0){throw 'Local SQL failed'}
 return $output
}
$setup=@"
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('$userId','authenticated','authenticated','phase8-concurrency-$userId@example.test','',now(),'{}','{"name":"Local concurrency fixture","company_name":"Phase8 local concurrency"}',now(),now());
select set_config('request.jwt.claims','{"sub":"$userId","role":"authenticated"}',false);
set role authenticated;
select public.finance_command(gen_random_uuid(),'account_create','{"name":"Concurrency A","kind":"bank","amount":1000}');
select public.finance_command(gen_random_uuid(),'account_create','{"name":"Concurrency B","kind":"bank"}');
"@
$null=RunSql $setup
$command=@"
begin;
select set_config('request.jwt.claims','{"sub":"$userId","role":"authenticated"}',true);
set local role authenticated;
select public.finance_command('$operationId','transfer',jsonb_build_object('account_id',(select id from public.financial_accounts where name='Concurrency A'),'destination_id',(select id from public.financial_accounts where name='Concurrency B'),'amount',100,'description','Concurrent exact replay'));
select pg_sleep(1);
commit;
"@
$jobs=1..2 | ForEach-Object {Start-Job -ScriptBlock {param($sql) $sql | docker exec -i supabase_db_PrintFlowPRO psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At; if($LASTEXITCODE -ne 0){throw 'Concurrent transaction failed'}} -ArgumentList $command}
$jobs | Wait-Job | Out-Null
foreach($job in $jobs){if($job.State -ne 'Completed'){throw 'Concurrent job failed'};Receive-Job $job | Out-Null;Remove-Job $job}
$verify=@"
select jsonb_build_object('legs',(select count(*) from public.financial_transactions where transfer_id='$operationId'),'receipts',(select count(*) from private.finance_commands where operation_id='$operationId'),'audit',(select count(*) from public.audit_logs where metadata->>'operation_id'='$operationId'),'balances',(select jsonb_object_agg(name,balance) from (select a.name,sum(case f.type when 'receita' then f.amount else -f.amount end) balance from public.financial_accounts a join public.financial_transactions f on f.account_id=a.id where a.company_id=(select company_id from public.profiles where auth_user_id='$userId' limit 1) group by a.name) b));
"@
$result=(RunSql $verify | Select-Object -Last 1)|ConvertFrom-Json
if($result.legs -ne 2 -or $result.receipts -ne 1 -or $result.audit -ne 1 -or $result.balances.'Concurrency A' -ne 900 -or $result.balances.'Concurrency B' -ne 100){throw 'Concurrency invariant failed'}
$result|ConvertTo-Json -Depth 4
Write-Output "PASS: two concurrent requests, one transfer. Disposable local fixture: $userId"
$payableSetup=@"
select set_config('request.jwt.claims','{"sub":"$userId","role":"authenticated"}',false);
set role authenticated;
select public.finance_command(gen_random_uuid(),'category_create','{"name":"Concurrency expense","type":"despesa"}');
select public.finance_command(gen_random_uuid(),'payable_create',jsonb_build_object('account_id',(select id from public.financial_accounts where name='Concurrency A'),'category_id',(select id from public.financial_categories where name='Concurrency expense'),'amount',50,'description','Concurrent payable'));
"@
$payable=(RunSql $payableSetup | Select-Object -Last 1 | ConvertFrom-Json).transaction
$expectedVersion=RunSql "select updated_at::text from public.financial_transactions where id='$($payable.id)';"
$payCommand=@"
begin;
select set_config('request.jwt.claims','{"sub":"$userId","role":"authenticated"}',true);
set local role authenticated;
do `$`$ begin
 perform public.finance_command(gen_random_uuid(),'payable_pay',jsonb_build_object('id','$($payable.id)','updated_at','$expectedVersion'));
 exception when serialization_failure then null;
end `$`$;
select pg_sleep(1);
commit;
"@
$jobs=1..2 | ForEach-Object {Start-Job -ScriptBlock {param($sql) $sql | docker exec -i supabase_db_PrintFlowPRO psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At; if($LASTEXITCODE -ne 0){throw 'Concurrent payment failed'}} -ArgumentList $payCommand}
$jobs | Wait-Job | Out-Null
foreach($job in $jobs){if($job.State -ne 'Completed'){throw 'Concurrent payment job failed'};Receive-Job $job | Out-Null;Remove-Job $job}
$count=RunSql "select count(*) from public.financial_transactions where payable_id='$($payable.id)' and reversal_of is null;"
if(($count | Select-Object -Last 1) -ne '1'){throw 'Concurrent payable duplicated or not settled'}
Write-Output 'PASS: two concurrent payment commands with different keys and same version, exactly one debit.'
