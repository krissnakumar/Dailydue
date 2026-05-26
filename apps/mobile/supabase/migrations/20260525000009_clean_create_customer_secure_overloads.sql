-- Dynamically drop all existing overloads of create_customer_secure and update_customer_enforced
-- to resolve PostgreSQL "Could not choose the best candidate function" ambiguity during RPC calls.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'create_customer_secure'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_signature
        FROM pg_proc
        WHERE proname = 'update_customer_enforced'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

-- 1. Recreate create_customer_secure with canonical 11-argument signature
create or replace function public.create_customer_secure(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default 0,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null,
  p_cep text default null,
  p_document_type text default null,
  p_document_value text default null
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
    is_active,
    cep,
    document_type,
    document_value
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
    true,
    nullif(p_cep, ''),
    nullif(p_document_type, ''),
    nullif(p_document_value, '')
  )
  returning * into new_row;

  return new_row;
end;
$$;

grant execute on function public.create_customer_secure(text, text, text, text, text, numeric, text, text, text, text, text) to authenticated;

-- 2. Recreate update_customer_enforced with canonical 13-argument signature
create or replace function public.update_customer_enforced(
  p_customer_id uuid,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default null,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null,
  p_clear_photo boolean default false,
  p_cep text default null,
  p_document_type text default null,
  p_document_value text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.customers;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.customers c
  set
    name = coalesce(p_name, c.name),
    full_name = coalesce(p_name, c.full_name),
    phone = case when p_phone is null then c.phone else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') end,
    email = case when p_email is null then c.email else nullif(p_email, '') end,
    address = case when p_address is null then c.address else nullif(p_address, '') end,
    notes = case when p_notes is null then c.notes else nullif(p_notes, '') end,
    credit_limit = coalesce(p_credit_limit, c.credit_limit),
    picture_storage_path = case when p_clear_photo then null when p_picture_storage_path is null then c.picture_storage_path else nullif(p_picture_storage_path, '') end,
    picture_mime_type = case when p_clear_photo then null when p_picture_mime_type is null then c.picture_mime_type else nullif(p_picture_mime_type, '') end,
    cep = case when p_cep is null then c.cep else nullif(p_cep, '') end,
    document_type = case when p_document_type is null then c.document_type else nullif(p_document_type, '') end,
    document_value = case when p_document_value is null then c.document_value else nullif(p_document_value, '') end,
    updated_at = now()
  where c.id = p_customer_id
    and c.user_id = auth.uid()
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'CUSTOMER_NOT_FOUND_OR_NOT_OWNED';
  end if;

  return updated_row;
end;
$$;

grant execute on function public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean, text, text, text) to authenticated;
