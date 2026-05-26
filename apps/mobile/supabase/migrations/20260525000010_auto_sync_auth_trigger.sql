-- ====================================================================
-- SUPABASE MIGRATION: Automatic User & Business Provisioning Trigger
-- Projeto: Controle de Fiado
-- Date: 2026-05-25
-- ====================================================================

-- 1. Create a trigger function to handle automatic profiling and business creation
create or replace function public.handle_new_user_registration()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  new_biz_id uuid;
  user_phone text;
  user_name text;
begin
  -- Extract phone and name from auth.users record or metadata fields
  user_phone := coalesce(
    new.phone,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'full_phone',
    ''
  );
  
  -- Clean non-digits from phone number
  user_phone := regexp_replace(user_phone, '\D', '', 'g');
  
  -- If phone is empty, generate a unique random placeholder string to prevent 
  -- unique constraint violations on public.businesses.phone column.
  if user_phone = '' then
    user_phone := '9' || floor(random() * 9000000000 + 1000000000)::text;
  end if;

  user_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Dono do Estabelecimento'
  );

  -- Check if a business with this phone already exists to avoid duplication
  select id into new_biz_id
  from public.businesses
  where phone = user_phone
  limit 1;

  -- Create a new business if one doesn't exist
  if new_biz_id is null then
    insert into public.businesses (business_name, owner_name, phone)
    values (user_name || ' Estabelecimento', user_name, user_phone)
    returning id into new_biz_id;
  end if;

  -- Create a matching record in public.profiles (formerly public.users)
  insert into public.profiles (id, business_id, role, full_name, phone)
  values (
    new.id,
    new_biz_id,
    'owner',
    user_name,
    user_phone
  )
  on conflict (id) do update
  set business_id = excluded.business_id,
      full_name = excluded.full_name,
      phone = excluded.phone;

  return new;
exception when others then
  -- Prevent authentication failures if trigger error occurs; safe fallback
  return new;
end;
$$;

-- 2. Attach the trigger to auth.users schema
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_registration();
