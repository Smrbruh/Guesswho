import {useState} from 'react';
import {EyeOff} from 'lucide-react';
import {useApp} from '../context';
import {rpc} from '../lib/supabase';
import type {Profile} from '../types';
export function PresencePrivacy(){
  const {t,profile,setProfile,online,toast}=useApp();const [busy,setBusy]=useState(false);
  const toggle=async()=>{setBusy(true);try{setProfile(await rpc<Profile>('set_presence_privacy',{p_hidden:!profile.hide_presence}));}catch{toast(t('Не удалось изменить приватность','Could not update privacy'));}finally{setBusy(false);}};
  return <section className="settings-panel"><div className="setting-heading"><EyeOff/><div><h2>{t('Невидимость','Invisible mode')}</h2><p>{t('Скрыть от друзей онлайн-статус и время последнего посещения. Сообщения и звонки остаются доступны.','Hide your online status and last seen from friends. Messages and calls remain available.')}</p></div><button className={`toggle ${profile.hide_presence?'on':''}`} role="switch" aria-checked={!!profile.hide_presence} disabled={!online||busy} aria-label={t('Скрыть онлайн и время посещения','Hide online status and last seen')} onClick={()=>void toggle()}/></div></section>;
}
