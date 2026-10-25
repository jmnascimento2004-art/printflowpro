-- Cover the new purchasing graph's foreign keys without changing business data.
create index supplier_products_product_lookup on public.supplier_products(company_id,product_id);
create index purchase_request_product_lookup on public.purchase_request_items(company_id,product_id);
create index purchase_order_product_lookup on public.purchase_order_items(company_id,product_id);
create index purchase_receipt_order_item_lookup on public.purchase_receipt_items(company_id,order_id,item_id);
create index purchase_receipt_order_receipt_lookup on public.purchase_receipt_items(company_id,order_id,receipt_id);
create index purchase_receipt_stock_lookup on public.purchase_receipt_items(stock_movement_id) where stock_movement_id is not null;
create index purchase_receipt_reversal_lookup on public.purchase_receipt_items(reversal_movement_id) where reversal_movement_id is not null;
