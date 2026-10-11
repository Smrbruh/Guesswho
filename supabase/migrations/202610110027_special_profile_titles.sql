alter table public.profiles add column level_bonus integer not null default 0 check(level_bonus between 0 and 9999);
alter table public.profiles add column special_titles text[] not null default '{}' check(special_titles <@ array['developer']::text[]);
create or replace function game_private.title_unlocked(p public.profiles, p_title text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_title
    when 'developer' then 'developer'=any(p.special_titles)
    when 'rookie' then true
    when 'first-case' then p.wins>=1
    when 'senpai' then coalesce((p.category_wins->>'naruto')::integer,0)+coalesce((p.category_wins->>'attack-on-titan')::integer,0)+coalesce((p.category_wins->>'jojo')::integer,0)+coalesce((p.category_wins->>'pokemon')::integer,0)>=5
    when 'sensei' then coalesce((p.category_wins->>'naruto')::integer,0)+coalesce((p.category_wins->>'attack-on-titan')::integer,0)+coalesce((p.category_wins->>'jojo')::integer,0)+coalesce((p.category_wins->>'pokemon')::integer,0)>=15
    when 'anime-legend' then coalesce((p.category_wins->>'naruto')::integer,0)+coalesce((p.category_wins->>'attack-on-titan')::integer,0)+coalesce((p.category_wins->>'jojo')::integer,0)+coalesce((p.category_wins->>'pokemon')::integer,0)>=30
    when 'wizard' then coalesce((p.category_wins->>'harry-potter')::integer,0)>=5
    when 'archmage' then coalesce((p.category_wins->>'harry-potter')::integer,0)>=20
    when 'avenger' then coalesce((p.category_wins->>'avengers')::integer,0)>=5
    when 'multiverse' then coalesce((p.category_wins->>'avengers')::integer,0)>=20
    when 'sherlock' then p.wins>=10
    when 'mastermind' then p.wins>=50
    when 'worldwalker' then coalesce((p.category_wins->>'naruto')::integer,0)>=5 and coalesce((p.category_wins->>'attack-on-titan')::integer,0)>=5 and coalesce((p.category_wins->>'harry-potter')::integer,0)>=5 and coalesce((p.category_wins->>'avengers')::integer,0)>=5
    else false end
$$;
