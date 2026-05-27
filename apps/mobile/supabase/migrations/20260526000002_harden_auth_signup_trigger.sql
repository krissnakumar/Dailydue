-- Harden auth signup trigger so OAuth signup never fails with:
-- "Database error saving new user"
--
-- Why:
-- Older/partially-migrated environments can still have incompatible
-- constraints or schema drift in public.businesses/public.profiles.
-- Any unhandled error in an auth.users trigger aborts user creation.

create or replace function public.handle_new_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_biz_id uuid;
  user_phone text;
  user_name text;
begin
  user_phone := coalesce(
    new.phone,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'full_phone',
    ''
  );

  user_phone := regexp_replace(user_phone, '\D', '', 'g');

  user_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Dono do Estabelecimento'
  );

  -- Reuse an existing business by phone when possible.
  if user_phone <> '' then
    select id into new_biz_id
    from public.businesses
    where phone = user_phone
    limit 1;
  end if;

  -- Create fallback business only when no match exists.
  if new_biz_id is null then
    begin
      insert into public.businesses (business_name, owner_name, phone)
      values (
        user_name || ' Estabelecimento',
        user_name,
        nullif(user_phone, '')
      )
      returning id into new_biz_id;
    exception
      when others then
        -- Last-resort fallback: try creating without phone in case of old
        -- unique/not-null constraints or malformed phone values.
        begin
          insert into public.businesses (business_name, owner_name)
          values (user_name || ' Estabelecimento', user_name)
          returning id into new_biz_id;
        exception
          when others then
            -- If business creation still fails, leave profile upsert skipped.
            new_biz_id := null;
        end;
    end;
  end if;

  if new_biz_id is not null then
    insert into public.profiles (id, business_id, role, full_name, phone)
    values (
      new.id,
      new_biz_id,
      'owner',
      user_name,
      nullif(user_phone, '')
    )
    on conflict (id) do update
    set business_id = coalesce(public.profiles.business_id, excluded.business_id),
        role = coalesce(public.profiles.role, excluded.role),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone = coalesce(public.profiles.phone, excluded.phone);
  end if;

  return new;
exception
  when others then
    -- Never block auth signup due to profile/business sync drift.
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user_registration();
