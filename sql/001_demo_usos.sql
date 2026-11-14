-- Contador de usos de las demos de pragma-ti.com/demos (3 por IP y por demo en 30 días).
-- La IP no se guarda: solo su huella SHA-256 con sal secreta. No se guardan documentos ni fotos.
create table if not exists public.demo_usos (
  id      bigserial primary key,
  huella  text not null,
  demo    text not null,
  creado  timestamptz not null default now()
);
create index if not exists demo_usos_huella_demo on public.demo_usos (huella, demo, creado);
create index if not exists demo_usos_demo_creado on public.demo_usos (demo, creado);
alter table public.demo_usos enable row level security;   -- sin políticas: solo service_role la ve

-- Reserva un uso. Devuelve cuántos quedan; -1 si la IP ya los gastó; -2 si la demo llegó a su tope del día.
create or replace function public.demo_consumir(p_huella text, p_demo text, p_limite int, p_dias int, p_tope_dia int)
returns int language plpgsql security definer set search_path = public as $$
declare v_usos int; v_hoy int;
begin
  perform pg_advisory_xact_lock(hashtext(p_huella || '|' || p_demo));
  select count(*) into v_hoy from demo_usos where demo = p_demo and creado >= date_trunc('day', now());
  if v_hoy >= p_tope_dia then return -2; end if;
  select count(*) into v_usos from demo_usos
   where huella = p_huella and demo = p_demo and creado >= now() - make_interval(days => p_dias);
  if v_usos >= p_limite then return -1; end if;
  insert into demo_usos (huella, demo) values (p_huella, p_demo);
  return p_limite - v_usos - 1;
end $$;

-- Devuelve el último uso cuando la demo falló por nuestro lado.
create or replace function public.demo_devolver(p_huella text, p_demo text)
returns void language sql security definer set search_path = public as $$
  delete from demo_usos where id = (
    select id from demo_usos where huella = p_huella and demo = p_demo order by id desc limit 1);
$$;

create or replace function public.demo_usados(p_huella text, p_dias int)
returns table (demo text, usos int) language sql security definer set search_path = public as $$
  select demo, count(*)::int from demo_usos
   where huella = p_huella and creado >= now() - make_interval(days => p_dias) group by demo;
$$;

revoke all on function public.demo_consumir(text, text, int, int, int) from public, anon, authenticated;
revoke all on function public.demo_devolver(text, text) from public, anon, authenticated;
revoke all on function public.demo_usados(text, int) from public, anon, authenticated;
grant execute on function public.demo_consumir(text, text, int, int, int) to service_role;
grant execute on function public.demo_devolver(text, text) to service_role;
grant execute on function public.demo_usados(text, int) to service_role;
