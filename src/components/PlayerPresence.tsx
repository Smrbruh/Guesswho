import {useApp} from '../context';
import type {Presence} from '../types';
export function PlayerPresence({activity}:{activity?:Presence}){
  const {t,lang}=useApp();
  if(!activity?.presence||activity.presence==='hidden')return <span className="player-presence hidden">{t('Статус скрыт','Status hidden')}</span>;
  const date=activity.last_seen?new Date(activity.last_seen):null;
  return <span className={`player-presence ${activity.presence}`}><i/>{activity.presence==='online'?t('В сети','Online'):date?t(`Был(а) ${date.toLocaleString(lang,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`,`Last seen ${date.toLocaleString(lang,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`):t('Не в сети','Offline')}</span>;
}
