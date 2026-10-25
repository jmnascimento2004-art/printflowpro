param([string]$Container='supabase_db_PrintFlowPRO')
$ErrorActionPreference='Stop'
if($Container -ne 'supabase_db_PrintFlowPRO'){throw 'This fixture runner only targets the named local PrintFlowPRO container.'}
function Invoke-LocalSql([string]$Sql){
 $lines=$Sql | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A 2>&1
 if($LASTEXITCODE -ne 0){throw ($lines -join "`n")}
 return ($lines | Where-Object {"$_".Trim()} | Select-Object -Last 1).ToString()
}
$actor=[guid]::NewGuid().ToString();$company=$null;$jobs=@()
$claims=('{"sub":"'+$actor+'","role":"authenticated"}');$auth="select set_config('request.jwt.claims','$claims',false); set role authenticated;"
try {
 $company=Invoke-LocalSql "insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('$actor','authenticated','authenticated','$actor@example.test','',now(),'{}','{`"name`":`"Concurrency QA`",`"company_name`":`"Purchasing concurrency QA`"}',now(),now()); select company_id from public.profiles where auth_user_id='$actor';"
 $product='purchase-concurrency-'+$actor
 [void](Invoke-LocalSql "insert into public.products(id,company_id,name,pricing_type,stock_controlled,current_stock) values('$product','$company','Concurrency material QA','unidade',true,0);select 'ready';")
 $supplier=(Invoke-LocalSql "$auth select public.purchase_command(gen_random_uuid(),'supplier_save','{`"name`":`"Concurrency supplier QA`"}');" | ConvertFrom-Json).supplier.id
 $fixtureDate=Invoke-LocalSql "select (now() at time zone 'America/Bahia')::date;"
 $cases=@(@{name='identical-idempotency-key';same=$true},@{name='different-keys-stale-version';same=$false})
 foreach($case in $cases){
  $payload=@{supplier_id=$supplier;ordered_date=$fixtureDate;items=@(@{product_id=$product;description='Concurrency QA material';unit='unidade';quantity=2;unit_price=10});installments=@(@{due_date=$fixtureDate;amount=20})}|ConvertTo-Json -Depth 8 -Compress
  $order=(Invoke-LocalSql "$auth select public.purchase_command(gen_random_uuid(),'order_save','$payload');"|ConvertFrom-Json).id
  $orderRow=Invoke-LocalSql "$auth select jsonb_build_object('id',id,'updated_at',updated_at) from public.purchase_orders where id='$order';"
  [void](Invoke-LocalSql "$auth select public.purchase_command(gen_random_uuid(),'order_transition','$orderRow'::jsonb||'{`"status`":`"confirmed`"}'::jsonb);")
  $receiptPayload=Invoke-LocalSql "$auth select jsonb_build_object('id',o.id,'updated_at',o.updated_at,'received_date','$fixtureDate','items',jsonb_build_array(jsonb_build_object('item_id',i.id,'quantity',1))) from public.purchase_orders o join public.purchase_order_items i on i.order_id=o.id where o.id='$order';"
  $operation=[guid]::NewGuid().ToString();$jobs=@()
  foreach($index in 1..2){
   $nonce=if($case.same){$operation}else{[guid]::NewGuid().ToString()}
   $jobSql="begin; $auth select public.purchase_command('$nonce','receive','$receiptPayload'); select pg_sleep(0.5); commit;"
   $jobs+=Start-Job -ScriptBlock {param($DbContainer,$SqlText)
    $output=$SqlText | docker exec -i $DbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A 2>&1
    [pscustomobject]@{ExitCode=$LASTEXITCODE;Output=($output -join "`n")}
   } -ArgumentList $Container,$jobSql
  }
  $results=@($jobs|Wait-Job|Receive-Job);$jobs|Remove-Job;$jobs=@()
  $success=@($results|Where-Object ExitCode -eq 0).Count
  if(($case.same -and $success -ne 2) -or (-not $case.same -and $success -ne 1)){throw "Unexpected concurrent outcome $($case.name): $($results|ConvertTo-Json -Compress)"}
  if(-not $case.same -and -not($results|Where-Object {$_.Output -match 'Compra atualizada por outra pessoa'})){throw 'Expected optimistic conflict was absent.'}
  $count=[int](Invoke-LocalSql "select count(*) from public.purchase_receipts where company_id='$company' and order_id='$order';")
  if($count -ne 1){throw "Receipt duplicated for $($case.name)"}
  Write-Output "PASS $($case.name): one receipt / one canonical stock entry"
 }
 $stock=[decimal](Invoke-LocalSql "select current_stock from public.products where id='$product';")
 if($stock -ne 2){throw "Expected stock 2, got $stock"}
 $receiptIds=Invoke-LocalSql "select jsonb_agg(jsonb_build_object('id',id,'order_id',order_id)) from public.purchase_receipts where company_id='$company';"|ConvertFrom-Json
 foreach($receipt in $receiptIds){
  $orderRow=Invoke-LocalSql "$auth select jsonb_build_object('id',id,'updated_at',updated_at) from public.purchase_orders where id='$($receipt.order_id)';"
  [void](Invoke-LocalSql "$auth select public.purchase_command(gen_random_uuid(),'receipt_reverse','$orderRow'::jsonb||jsonb_build_object('receipt_id','$($receipt.id)','reason','Concurrency QA cleanup'));")
  $orderRow=Invoke-LocalSql "$auth select jsonb_build_object('id',id,'updated_at',updated_at) from public.purchase_orders where id='$($receipt.order_id)';"
  [void](Invoke-LocalSql "$auth select public.purchase_command(gen_random_uuid(),'order_transition','$orderRow'::jsonb||'{`"status`":`"cancelled`"}'::jsonb);")
 }
 if([decimal](Invoke-LocalSql "select current_stock from public.products where id='$product';") -ne 0){throw 'Stock cleanup did not return baseline.'}
 Write-Output 'PASS inverse cleanup: stock baseline 0, purchases cancelled, no financial obligations'
} finally {
 if($jobs.Count){$jobs|Stop-Job;$jobs|Remove-Job}
 if($company){
  # Audit is immutable, including in QA. Preserve the cancelled history and disable
  # this local synthetic actor rather than deleting the tenant/audit graph.
  [void](Invoke-LocalSql "begin; update public.products set active=false where company_id='$company';update public.suppliers set active=false where company_id='$company';update public.profiles set active=false where company_id='$company';update auth.users set banned_until='infinity' where id='$actor';commit;select 'QA history preserved; fixtures inactive';")
 }
}
