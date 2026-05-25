-- Fix ambiguous RPC resolution for `create_customer_secure` seen during background sync:
-- "Could not choose the best candidate function between ..."
--
-- Some older databases ended up with multiple `public.create_customer_secure` overloads
-- (including a 9-argument variant). When calling via `supabase.rpc(...)` with named params,
-- Postgres may not be able to choose the best candidate.
--
-- We keep a single canonical 8-argument function that matches the current app.

drop function if exists public.create_customer_secure(
  text,  -- p_name or p_full_name (legacy)
  text,  -- p_phone
  text,  -- p_email
  text,  -- p_address
  text,  -- p_notes
  numeric, -- p_credit_limit
  text,  -- p_picture_storage_path
  text,  -- p_picture_mime_type
  text   -- legacy extra arg (e.g. p_full_name)
);

-- Drop the 9-argument overload where p_phone is first (seen in some environments)
drop function if exists public.create_customer_secure(
  text,    -- p_phone
  text,    -- p_email
  text,    -- p_address
  text,    -- p_notes
  numeric, -- p_credit_limit
  text,    -- p_picture_storage_path
  text,    -- p_picture_mime_type
  text,    -- p_name
  text     -- p_full_name
);

drop function if exists public.create_customer_secure(
  text,
  text,
  text,
  text,
  text,
  numeric,
  text,
  text
);

-- Drop legacy unused overloads with arguments from earlier migrations
drop function if exists public.can_create_customer(uuid);
drop function if exists public.can_create_transaction(uuid);

create or replace function public.create_customer_secure(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default 0,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.customers;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.can_create_customer();

  insert into public.customers (
    user_id,
    business_id,
    name,
    full_name,
    phone,
    email,
    address,
    notes,
    credit_limit,
    picture_storage_path,
    picture_mime_type,
    is_active
  )
  values (
    auth.uid(),
    public.get_current_business_id(),
    p_name,
    p_name,
    regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
    nullif(p_email, ''),
    nullif(p_address, ''),
    nullif(p_notes, ''),
    coalesce(p_credit_limit, 0),
    nullif(p_picture_storage_path, ''),
    nullif(p_picture_mime_type, ''),
    true
  )
  returning * into new_row;

  return new_row;
end;
$$;

grant execute on function public.create_customer_secure(text, text, text, text, text, numeric, text, text) to authenticated;
