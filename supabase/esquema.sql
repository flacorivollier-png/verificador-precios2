-- =====================================================================
--  Verificador de precios · Guille Deco Bazar
--  Pegar TODO este archivo en Supabase → SQL Editor → New query → Run
--  Se puede volver a ejecutar sin problema.
-- =====================================================================

-- ---------- PERFILES (un registro por cada usuario) ----------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  nombre    text not null default '',
  rol       text not null default 'usuario' check (rol in ('admin', 'usuario')),
  aprobado  boolean not null default false,
  creado    timestamptz not null default now()
);

-- Al registrarse alguien se crea su perfil.
-- El PRIMER usuario que se registra queda como admin y aprobado.
create or replace function public.nuevo_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  perform pg_advisory_xact_lock(4242);
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, email, nombre, rol, aprobado)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''),
          case when primero then 'admin' else 'usuario' end, primero);
  return new;
end $$;

drop trigger if exists al_registrar_usuario on auth.users;
create trigger al_registrar_usuario after insert on auth.users
  for each row execute function public.nuevo_perfil();

-- Ayudantes para los permisos
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and aprobado);
$$;

create or replace function public.es_aprobado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and aprobado);
$$;

alter table public.perfiles enable row level security;
drop policy if exists "ver mi perfil o admin ve todos" on public.perfiles;
create policy "ver mi perfil o admin ve todos" on public.perfiles
  for select using (id = auth.uid() or public.es_admin());
drop policy if exists "admin modifica perfiles" on public.perfiles;
create policy "admin modifica perfiles" on public.perfiles
  for update using (public.es_admin()) with check (public.es_admin());

-- El admin no puede sacarse a sí mismo el rol (para no quedar sin admin)
create or replace function public.proteger_admin()
returns trigger language plpgsql as $$
begin
  if old.id = auth.uid() and (new.rol <> 'admin' or not new.aprobado) then
    raise exception 'No podés quitarte el rol de admin a vos mismo';
  end if;
  return new;
end $$;
drop trigger if exists proteger_admin on public.perfiles;
create trigger proteger_admin before update on public.perfiles
  for each row execute function public.proteger_admin();

-- ---------- LISTA DE PRECIOS (la lista va como archivo; acá sólo la versión) ----------
create table if not exists public.lista (
  id           int primary key default 1 check (id = 1),
  version      bigint not null,
  ruta         text not null,
  archivo      text not null default '',
  cantidad     int not null default 0,
  actualizado  timestamptz not null default now()
);
alter table public.lista enable row level security;
drop policy if exists "aprobados ven la lista" on public.lista;
create policy "aprobados ven la lista" on public.lista for select using (public.es_aprobado());
drop policy if exists "admin escribe la lista" on public.lista;
create policy "admin escribe la lista" on public.lista for all using (public.es_admin()) with check (public.es_admin());

-- ---------- FICHAS (foto, descripción, características) ----------
create table if not exists public.fichas (
  codigo           text primary key,
  descripcion      text not null default '',
  caracteristicas  text not null default '',
  destacado        boolean not null default false,
  foto_ruta        text,
  mini             text,
  borrado          boolean not null default false,
  actualizado      timestamptz not null default now()
);
create index if not exists fichas_actualizado on public.fichas (actualizado);

create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin new.actualizado = clock_timestamp(); return new; end $$;
drop trigger if exists fichas_actualizado on public.fichas;
create trigger fichas_actualizado before insert or update on public.fichas
  for each row execute function public.tocar_actualizado();

alter table public.fichas enable row level security;
drop policy if exists "aprobados ven fichas" on public.fichas;
create policy "aprobados ven fichas" on public.fichas for select using (public.es_aprobado());
drop policy if exists "admin escribe fichas" on public.fichas;
create policy "admin escribe fichas" on public.fichas for all using (public.es_admin()) with check (public.es_admin());

-- ---------- ARCHIVOS (lista comprimida y fotos) ----------
insert into storage.buckets (id, name, public)
values ('datos', 'datos', false)
on conflict (id) do nothing;

drop policy if exists "aprobados leen datos" on storage.objects;
create policy "aprobados leen datos" on storage.objects
  for select using (bucket_id = 'datos' and public.es_aprobado());
drop policy if exists "admin sube datos" on storage.objects;
create policy "admin sube datos" on storage.objects
  for insert with check (bucket_id = 'datos' and public.es_admin());
drop policy if exists "admin cambia datos" on storage.objects;
create policy "admin cambia datos" on storage.objects
  for update using (bucket_id = 'datos' and public.es_admin());
drop policy if exists "admin borra datos" on storage.objects;
create policy "admin borra datos" on storage.objects
  for delete using (bucket_id = 'datos' and public.es_admin());
