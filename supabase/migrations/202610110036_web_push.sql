create table game_private.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text unique not null,
  subscription jsonb not null,
  lang text not null default 'ru' check(lang in('ru','en')),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user on game_private.push_subscriptions(user_id);
create table game_private.push_deliveries(
  id bigint generated always as identity primary key,
  subscription_id uuid not null references game_private.push_subscriptions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in('message','call')),
  event_id text not null,
  expires_at timestamptz not null,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  unique(subscription_id,kind,event_id)
);
revoke all on game_private.push_subscriptions,game_private.push_deliveries from public,anon,authenticated;
create function game_private.queue_social_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='direct_messages' then
    insert into game_private.push_deliveries(subscription_id,sender_id,kind,event_id,expires_at,available_at)
    select id,new.sender_id,'message',new.id::text,now()+interval '1 hour',now()+interval '2 seconds' from game_private.push_subscriptions where user_id=new.recipient_id;
  else
    insert into game_private.push_deliveries(subscription_id,sender_id,kind,event_id,expires_at)
    select id,new.caller_id,'call',new.id::text,new.created_at+interval '45 seconds' from game_private.push_subscriptions where user_id=new.callee_id;
  end if;
  return new;
end $$;
revoke all on function game_private.queue_social_push() from public,anon,authenticated;
create trigger direct_message_push after insert on game_private.direct_messages for each row execute function game_private.queue_social_push();
create trigger direct_call_push after insert on game_private.direct_calls for each row execute function game_private.queue_social_push();
