import {useEffect, useState} from 'react';
import {Search} from 'lucide-react';
import {useApp} from '../context';
import {rpc} from '../lib/supabase';
import type {DeckSummary} from '../types';
import {Modal} from './ui';

export function RoomDeckPicker({roomId,onClose,onChanged}:{roomId:string;onClose:()=>void;onChanged:()=>Promise<void>}) {
  const {t,toast}=useApp();
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const [decks,setDecks]=useState<DeckSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setFailed(false);
    const timer=setTimeout(()=>{void rpc<DeckSummary[]>('list_decks',{p_search:search,p_page:page,p_scope:'all',p_sort:'popular'}).then(value=>{if(active)setDecks(value);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});},200);
    return()=>{active=false;clearTimeout(timer);};
  },[search,page,revision]);
  const choose=async(id:string)=>{setBusy(true);try{await rpc('change_room_deck',{p_room:roomId,p_category:id});await onChanged();onClose();toast(t('Колода изменена. Выберите секреты заново.','Deck changed. Choose new secrets.'));}catch{toast(t('Колода не изменена. Возможно, раунд уже начался.','Deck not changed. The round may have already started.'));}finally{setBusy(false);}};
  return <Modal title={t('Сменить пак в комнате','Change room deck')} onClose={onClose}><p className="muted">{t('Выбор сбросит готовность обоих игроков. Во время раунда состав менять нельзя.','This resets both players’ readiness. The lineup cannot change during a round.')}</p><label className="deck-search"><Search size={18}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder={t('Найти пак','Find a deck')} aria-label={t('Поиск пака в комнате','Search room decks')}/></label>{failed ? <button className="button" onClick={()=>setRevision(v=>v+1)}>{t('Повторить загрузку','Retry loading')}</button> : loading ? <p role="status">{t('Загружаем…','Loading…')}</p> : <div className="room-deck-list">{decks.map(d=><button className="room-deck-option" key={d.id} disabled={busy} onClick={()=>void choose(d.id)}><img src={d.cover} alt="" loading="lazy"/><span><strong>{t(d.title,d.titleEn)}</strong><small>{d.size} {t('карт','cards')} · {d.author || 'GuessWho Arena'}</small></span></button>)}{!decks.length && <p>{t('Паки не найдены','No decks found')}</p>}</div>}<div className="modal-actions"><button className="button" disabled={page===0||loading||busy} onClick={()=>setPage(p=>p-1)}>{t('Назад','Previous')}</button><span>{page+1}</span><button className="button" disabled={decks.length<20||loading||busy} onClick={()=>setPage(p=>p+1)}>{t('Дальше','Next')}</button></div></Modal>;
}
