create or replace function public.save_deck(p_id text,p_data jsonb,p_published boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare d public.decks; c jsonb; question jsonb; question_set jsonb; allowed_traits text[]; image bytea; identity text:=coalesce(p_id,gen_random_uuid()::text);
begin
  perform id from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'UNAUTHORIZED'; end if;
  if p_id is not null then
    select * into d from public.decks where id=p_id for update;
    if d.owner_id is distinct from auth.uid() then raise exception 'NOT_OWNED'; end if;
  elsif (select count(*) from public.decks where owner_id=auth.uid())>=20 then raise exception 'DECK_LIMIT'; end if;
  if p_data is null or jsonb_typeof(p_data)!='object' or length(p_data::text)>6000000 or coalesce(length(trim(p_data->>'title')),0) not between 2 and 60 or coalesce(length(trim(p_data->>'titleEn')),0) not between 2 and 60 or coalesce(length(p_data->>'subtitle'),0)>200 or coalesce(length(p_data->>'subtitleEn'),0)>200 or coalesce(p_data->>'color','') !~ '^#[0-9a-fA-F]{6}$' or jsonb_typeof(p_data->'characters') is distinct from 'array' then raise exception 'INVALID_DECK'; end if;
  if jsonb_array_length(p_data->'characters') not between 6 and 64 then raise exception 'INVALID_DECK_SIZE'; end if;
  if (select count(distinct entry->>'id') from jsonb_array_elements(p_data->'characters') entry)!=jsonb_array_length(p_data->'characters') then raise exception 'INVALID_CHARACTER'; end if;
  allowed_traits:=array['male','female','dark','light','glasses'];
  if p_data ? 'questions' then
    question_set:=p_data->'questions';
    if jsonb_typeof(question_set) is distinct from 'array' then raise exception 'INVALID_QUESTIONS'; end if;
    if jsonb_array_length(question_set) not between 1 and 24 then raise exception 'INVALID_QUESTIONS'; end if;
    if (select count(distinct entry->>'key') from jsonb_array_elements(question_set) entry)!=jsonb_array_length(question_set) then raise exception 'INVALID_QUESTIONS'; end if;
    for question in select * from jsonb_array_elements(question_set) loop
      if jsonb_typeof(question) is distinct from 'object' or jsonb_typeof(question->'key') is distinct from 'string' or coalesce(question->>'key','') !~ '^[a-z][a-z0-9_]{0,31}$' or jsonb_typeof(question->'ru') is distinct from 'string' or jsonb_typeof(question->'en') is distinct from 'string' or coalesce(length(trim(question->>'ru')),0) not between 3 and 160 or coalesce(length(trim(question->>'en')),0) not between 3 and 160 then raise exception 'INVALID_QUESTIONS'; end if;
    end loop;
    select array_agg(entry->>'key'),jsonb_agg(jsonb_build_object('key',entry->>'key','ru',trim(entry->>'ru'),'en',trim(entry->>'en'))) into allowed_traits,question_set from jsonb_array_elements(question_set) entry;
  end if;
  for c in select * from jsonb_array_elements(p_data->'characters') loop
    if coalesce(c->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or coalesce(length(trim(c->>'name')),0) not between 1 and 60 or coalesce(length(trim(c->>'nameEn')),0) not between 1 and 60 or jsonb_typeof(c->'traits') is distinct from 'array' then raise exception 'INVALID_CHARACTER'; end if;
    if jsonb_array_length(c->'traits')>24 or exists(select 1 from jsonb_array_elements(c->'traits') t where jsonb_typeof(t) is distinct from 'string' or not (t #>> '{}'=any(allowed_traits))) then raise exception 'INVALID_TRAITS'; end if;
    if coalesce(c->>'img','') ~ '^/images/[a-z0-9-]+/[a-z0-9-]+[.]webp$' then
      if not exists(select 1 from public.decks official_deck,jsonb_array_elements(official_deck.data->'characters') official where official_deck.owner_id is null and official->>'img'=c->>'img') then raise exception 'INVALID_IMAGE'; end if;
    else
      if coalesce(length(c->>'img'),0)>90000 or coalesce(c->>'img','') !~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$' then raise exception 'INVALID_IMAGE'; end if;
      image:=decode(substr(c->>'img',24),'base64');
      if octet_length(image)<20 or substring(image from 1 for 4)!=decode('52494646','hex') or substring(image from 9 for 4)!=decode('57454250','hex') then raise exception 'INVALID_IMAGE'; end if;
    end if;
  end loop;
  p_data:=jsonb_build_object('id',identity,'title',trim(p_data->>'title'),'titleEn',trim(p_data->>'titleEn'),'subtitle',coalesce(p_data->>'subtitle',''),'subtitleEn',coalesce(p_data->>'subtitleEn',''),'color',p_data->>'color','characters',p_data->'characters');
  if question_set is not null then p_data:=p_data||jsonb_build_object('questions',question_set); end if;
  insert into public.decks(id,owner_id,data,published) values(identity,auth.uid(),p_data,p_published) on conflict(id) do update set data=excluded.data,published=excluded.published,updated_at=now();
  return identity;
end $$;
