-- ====================================================================
-- SUPABASE MIGRATION: Schema Inicial e Políticas de RLS Multi-Tenant
-- Projeto: Controle de Fiado (Idempotente)
-- ====================================================================

-- Habilita extensão para geração de UUIDs nativos
create extension if not exists "uuid-ossp";

-- ====================================================================
-- 1. TABELAS
-- ====================================================================

-- TABELA: businesses (Lojas / Estabelecimentos)
create table if not exists public.businesses (
    id uuid primary key default uuid_generate_v4(),
    business_name text not null,
    owner_name text not null,
    phone text not null unique,
    pix_key text,
    created_at timestamptz not null default now()
);

-- TABELA: users (Colaboradores e Donos do Estabelecimento)
create table if not exists public.users (
    id uuid primary key references auth.users on delete cascade,
    business_id uuid not null references public.businesses(id) on delete cascade,
    role text not null check (role in ('owner', 'cashier', 'employee')),
    full_name text not null,
    phone text not null,
    created_at timestamptz not null default now()
);

-- TABELA: customers (Clientes do Caderninho)
create table if not exists public.customers (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    full_name text not null,
    phone text not null,
    photo_url text,
    notes text,
    total_debt numeric(12, 2) not null default 0.00,
    created_at timestamptz not null default now()
);

-- Índices solicitados para alta performance de busca
create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_customers_full_name on public.customers(full_name);
create index if not exists idx_customers_business_id on public.customers(business_id);

-- TABELA: transactions (Histórico de Compras e Baixas/Pagamentos)
create table if not exists public.transactions (
    id uuid primary key default uuid_generate_v4(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    customer_id uuid not null references public.customers(id) on delete cascade,
    type text not null check (type in ('debt', 'payment')),
    amount numeric(12, 2) not null check (amount > 0),
    description text not null,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_transactions_business_id on public.transactions(business_id);
create index if not exists idx_transactions_customer_id on public.transactions(customer_id);

-- TABELA: whatsapp_logs (Histórico de Envios de Cobrança)
create table if not exists public.whatsapp_logs (
    id uuid primary key default uuid_generate_v4(),
    customer_id uuid not null references public.customers(id) on delete cascade,
    phone text not null,
    message text not null,
    status text not null check (status in ('sent', 'delivered', 'failed')),
    created_at timestamptz not null default now()
);

-- ====================================================================
-- 2. FUNÇÕES AUXILIARES DE CONTEXTO E SEGURANÇA (PERFORMANCE)
-- ====================================================================

-- Obtém o business_id do usuário logado atual de forma performática e cacheável na query
create or replace function public.get_current_business_id()
returns uuid
language sql security definer set search_path = public
stable
as $$
    select business_id from public.users where id = auth.uid() limit 1;
$$;

-- Obtém a regra (role) do usuário logado
create or replace function public.get_current_user_role()
returns text
language sql security definer set search_path = public
stable
as $$
    select role from public.users where id = auth.uid() limit 1;
$$;

-- ====================================================================
-- 3. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ====================================================================

-- Habilita RLS em todas as tabelas de forma segura
alter table public.businesses enable row level security;
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.transactions enable row level security;
alter table public.whatsapp_logs enable row level security;

-- Remove políticas anteriores para recriação limpa
drop policy if exists "Acesso de visualização apenas para membros da loja" on public.businesses;
drop policy if exists "Apenas o dono pode atualizar a loja" on public.businesses;

drop policy if exists "Visualização de membros da mesma loja" on public.users;
drop policy if exists "Gerenciamento de usuários restrito ao dono" on public.users;

drop policy if exists "Acesso total aos clientes da própria loja" on public.customers;

drop policy if exists "Acesso a transações da própria loja" on public.transactions;
drop policy if exists "Inserção de transações permitida aos colaboradores da loja" on public.transactions;
drop policy if exists "Apenas o dono pode alterar/deletar histórico financeiro" on public.transactions;
drop policy if exists "Apenas o dono pode excluir transações" on public.transactions;

drop policy if exists "Acesso a logs do WhatsApp da própria loja" on public.whatsapp_logs;

-- POLÍTICAS: businesses
create policy "Acesso de visualização apenas para membros da loja"
    on public.businesses for select
    using (id = public.get_current_business_id());

create policy "Apenas o dono pode atualizar a loja"
    on public.businesses for update
    using (id = public.get_current_business_id() and public.get_current_user_role() = 'owner');

-- POLÍTICAS: users
create policy "Visualização de membros da mesma loja"
    on public.users for select
    using (business_id = public.get_current_business_id());

create policy "Gerenciamento de usuários restrito ao dono"
    on public.users for all
    using (business_id = public.get_current_business_id() and public.get_current_user_role() = 'owner');

-- POLÍTICAS: customers
create policy "Acesso total aos clientes da própria loja"
    on public.customers for all
    using (business_id = public.get_current_business_id());

-- POLÍTICAS: transactions
create policy "Acesso a transações da própria loja"
    on public.transactions for select
    using (business_id = public.get_current_business_id());

create policy "Inserção de transações permitida aos colaboradores da loja"
    on public.transactions for insert
    with check (business_id = public.get_current_business_id());

create policy "Apenas o dono pode alterar/deletar histórico financeiro"
    on public.transactions for update
    using (business_id = public.get_current_business_id() and public.get_current_user_role() = 'owner');

create policy "Apenas o dono pode excluir transações"
    on public.transactions for delete
    using (business_id = public.get_current_business_id() and public.get_current_user_role() = 'owner');

-- POLÍTICAS: whatsapp_logs
create policy "Acesso a logs do WhatsApp da própria loja"
    on public.whatsapp_logs for all
    using (
        customer_id in (
            select id from public.customers where business_id = public.get_current_business_id()
        )
    );

-- ====================================================================
-- 4. TRIGGERS AUTOMÁTICOS
-- ====================================================================

-- Trigger para manter o total_debt do customer perfeitamente sincronizado com as transações
create or replace function public.update_customer_debt()
returns trigger as $$
begin
    if (tg_op = 'INSERT') then
        if (new.type = 'debt') then
            update public.customers 
            set total_debt = total_debt + new.amount 
            where id = new.customer_id;
        elsif (new.type = 'payment') then
            update public.customers 
            set total_debt = total_debt - new.amount 
            where id = new.customer_id;
        end if;
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_update_debt_on_transaction on public.transactions;

create trigger trg_update_debt_on_transaction
    after insert on public.transactions
    for each row execute function public.update_customer_debt();

-- ====================================================================
-- 5. TABELA DE ITENS RÁPIDOS (AUTO-SUGESTÃO INTELIGENTE)
-- ====================================================================

create table if not exists public.quick_items (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  default_price numeric(12, 2) default 0.00,
  usage_count integer default 0,
  last_used_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_quick_items_business_id on public.quick_items(business_id);

alter table public.quick_items enable row level security;

drop policy if exists "Acesso a sugestões rápidas da própria loja" on public.quick_items;

create policy "Acesso a sugestões rápidas da própria loja"
    on public.quick_items for all
    using (business_id = public.get_current_business_id());


