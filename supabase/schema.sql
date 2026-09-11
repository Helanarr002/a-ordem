-- ============================================================
-- A ORDEM — schema completo (Auth + conteúdo + licenças)
-- Rodar via `supabase db push` ou colar no SQL Editor do Dashboard.
-- Idempotente: pode rodar de novo sem quebrar (usa IF NOT EXISTS / OR REPLACE).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES ---------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'aluno' check (role in ('admin', 'aluno')),
  created_at timestamptz not null default now()
);

-- cria profile automaticamente quando nasce um usuário no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- LICENSES -----------------------------------------------------
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'padrao',
  status text not null default 'active' check (status in ('active', 'revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists licenses_user_id_idx on public.licenses(user_id);

-- ---------- SITE CONTENT (o que o admin edita) ---------------------------
create table if not exists public.site_content (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- MODULES / LESSONS (cursos) ------------------------------------
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  cover_image_url text,
  order_index int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  description text,
  video_provider text not null default 'youtube_unlisted',
  video_id text,
  duration_min int not null default 0,
  materials jsonb not null default '[]'::jsonb,
  order_index int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists lessons_module_id_idx on public.lessons(module_id);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------- POSTS (mentorias ao vivo + sala de sinais) --------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('mentoria', 'sinal')),
  title text not null,
  body text,
  image_url text,
  video_id text,
  category text,
  order_index int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists posts_type_idx on public.posts(type);

-- ---------- FUNÇÕES DE ACESSO (usadas nas policies) -----------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.has_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.licenses
    where user_id = auth.uid()
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_access() to authenticated;

-- ---------- RLS ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.site_content enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.posts enable row level security;

-- profiles: cada um vê o próprio; admin vê todos
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- licenses: dono vê a própria; só admin cria/edita/apaga
drop policy if exists "licenses_select_own_or_admin" on public.licenses;
create policy "licenses_select_own_or_admin" on public.licenses
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "licenses_write_admin" on public.licenses;
create policy "licenses_write_admin" on public.licenses
  for all using (public.is_admin()) with check (public.is_admin());

-- site_content: qualquer autenticado com acesso lê; só admin escreve
drop policy if exists "site_content_select" on public.site_content;
create policy "site_content_select" on public.site_content
  for select using (true);

drop policy if exists "site_content_write_admin" on public.site_content;
create policy "site_content_write_admin" on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());

-- modules/lessons: publicado + has_access() lê; admin lê/escreve tudo
drop policy if exists "modules_select" on public.modules;
create policy "modules_select" on public.modules
  for select using (published and public.has_access() or public.is_admin());

drop policy if exists "modules_write_admin" on public.modules;
create policy "modules_write_admin" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons
  for select using (published and public.has_access() or public.is_admin());

drop policy if exists "lessons_write_admin" on public.lessons;
create policy "lessons_write_admin" on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

-- lesson_progress: cada aluno só mexe no seu
drop policy if exists "progress_owner" on public.lesson_progress;
create policy "progress_owner" on public.lesson_progress
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- posts: mesma regra de modules/lessons
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select using (published and public.has_access() or public.is_admin());

drop policy if exists "posts_write_admin" on public.posts;
create policy "posts_write_admin" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- STORAGE (bucket "media": capas, logo, banners, imagens) -------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media_admin_write" on storage.objects;
create policy "media_admin_write" on storage.objects
  for insert with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update" on storage.objects
  for update using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete" on storage.objects
  for delete using (bucket_id = 'media' and public.is_admin());

-- ---------- SEED: conteúdo inicial (mesmo texto que já está no site) ------
insert into public.site_content (key, data) values
('brand', '{
  "name": "A ORDEM",
  "by": "por Genisson Silva FX",
  "logo_url": "assets/logo-aordem.png"
}'),
('design_tokens', '{
  "accent": "#8b3bff",
  "accent_bright": "#a855f7",
  "accent_magenta": "#d011c9",
  "bg_0": "#060510"
}'),
('hero_slides', '[
  {"tag":"Bem-vindo à Ordem","title":"Você está dentro. Agora é disciplina.","text":"A comunidade de traders de Genisson Silva FX: método, sala ao vivo e os setups que operamos todo dia no mercado.","bg":"assets/banner-genisson.png"},
  {"tag":"Ao vivo · toda terça 20h","title":"Mentoria ao vivo com o Genisson","text":"Análise do mercado da semana, tira-dúvidas e leitura de gráfico em tempo real.","bg":"assets/banner-genisson.png"}
]'),
('comunidade', '{
  "title": "Comunidade da Ordem",
  "text": "Grupo oficial de alunos para trocar ideia, tirar dúvida rápida e acompanhar avisos.",
  "cta_label": "Entrar no grupo",
  "cta_url": ""
}'),
('suporte', '{
  "text": "Dúvidas sobre acesso, pagamento ou conteúdo: fale com a equipe.",
  "whatsapp_url": "",
  "email": "",
  "faq": []
}'),
('landing', '{
  "headline": "O mercado não recompensa quem tenta. Recompensa quem tem método.",
  "subheadline": "A comunidade de traders de Genisson Silva FX: trilha completa, mentorias ao vivo e Sala de Sinais.",
  "cta_label": "Quero fazer parte",
  "cta_url": "",
  "highlights": [
    {"title": "Trilha completa", "text": "8 módulos, do zero até os setups da Ordem."},
    {"title": "Mentorias ao vivo", "text": "Toda terça às 20h, com gravação liberada depois."},
    {"title": "Sala de Sinais", "text": "Bônus atualizado toda semana com os setups mapeados."}
  ],
  "stats": [],
  "about": {},
  "testimonials": [],
  "pricing": {}
}')
on conflict (key) do nothing;
