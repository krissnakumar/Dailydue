-- Allow authenticated owners to update their own business row.
-- Needed for profile/settings updates (business_name / phone / pix_key) via update_owner_profile().

alter table public.businesses enable row level security;

-- Keep policy names consistent with other migrations.
drop policy if exists "businesses_update_own" on public.businesses;
drop policy if exists "Apenas o dono pode atualizar a loja" on public.businesses;

create policy "businesses_update_own"
  on public.businesses
  for update
  using (
    auth.uid() is not null
    and id = public.get_current_business_id()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
        and p.business_id = id
    )
  )
  with check (
    auth.uid() is not null
    and id = public.get_current_business_id()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'owner'
        and p.business_id = id
    )
  );

grant update on public.businesses to authenticated;
