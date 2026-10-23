-- Protección de la tabla de suscriptores (RLS = Row Level Security).
-- Dónde ejecutarlo: Supabase → SQL Editor → pega esto → Run. Se puede repetir sin problema.
--
-- Qué hace: activa RLS y quita cualquier regla que deje leer o escribir con la clave pública
-- (la que está en docs/suscribirse.html). Las Edge Functions y enviar.js usan la clave
-- SECRETA, que se salta RLS, así que siguen funcionando igual.

alter table public.suscriptores enable row level security;

-- Borra todas las reglas (policies) que hubiera en la tabla: sin reglas, nadie con la clave
-- pública puede leer ni escribir.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'suscriptores' loop
    execute format('drop policy %I on public.suscriptores', p.policyname);
  end loop;
end $$;

-- Comprobación: debe salir rowsecurity = true y ninguna fila en la segunda consulta.
select relname, relrowsecurity as rowsecurity from pg_class where relname = 'suscriptores';
select policyname, cmd, roles from pg_policies where tablename = 'suscriptores';
