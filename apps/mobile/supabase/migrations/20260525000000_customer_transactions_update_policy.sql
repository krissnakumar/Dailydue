-- Allow authenticated users to update their own customer transactions.
-- This is needed for editing transaction description/amount from the app/admin tooling.

alter table public.customer_transactions enable row level security;

-- Keep policy names consistent with other migrations.
drop policy if exists "customer_transactions_update_own" on public.customer_transactions;
drop policy if exists "Update own transactions" on public.customer_transactions;
drop policy if exists "Apenas o dono pode alterar/deletar histórico financeiro" on public.customer_transactions;

create policy "customer_transactions_update_own"
  on public.customer_transactions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

