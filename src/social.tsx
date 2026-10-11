import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Mic,MicOff,Phone,PhoneOff,MessageCircle,X} from 'lucide-react';
import {useApp} from './context';
import {localSocket,rpc,supabase} from './lib/supabase';
import {VoiceChat} from './lib/voice';
import {sound} from './lib/audio';
import {Avatar} from './components/ui';
import type {PublicPlayer,DirectCall} from './types';

type SocialState={unread:number;latest:{id:number;user_id:string;username:string}|null;call:DirectCall|null};
type SocialContext={unread:number;call:DirectCall|null;startCall:(player:PublicPlayer)=>Promise<void>;refreshSocial:()=>Promise<void>};
const Context=createContext<SocialContext>(null!);
export const useSocial=()=>useContext(Context);
export function SocialProvider({children}:{children:ReactNode}){
  const {profile,online,t,toast,navigate,path}=useApp();
  const [state,setState]=useState<SocialState>({unread:0,latest:null,call:null});
  const [notice,setNotice]=useState<SocialState['latest']>(null);
  const [voiceState,setVoiceState]=useState('off');const [muted,setMuted]=useState(false);const [busy,setBusy]=useState(false);const [joining,setJoining]=useState<string|null>(null);
  const voice=useRef<VoiceChat|null>(null),inFlight=useRef(false),lastMessage=useRef<number|null>(null),currentCall=useRef<DirectCall|null>(null);
  const revision=useRef(0);
  const latest=useRef({path,t,toast});latest.current={path,t,toast};currentCall.current=state.call;
  const refreshSocial=async()=>{
    if(!online||inFlight.current)return;inFlight.current=true;const requestRevision=revision.current;
    try{
      const next=await rpc<SocialState>('social_state');if(requestRevision!==revision.current)return;setState(next);
      if(lastMessage.current!==null&&next.latest&&next.latest.id>lastMessage.current&&!(latest.current.path.startsWith('/messages?')&&latest.current.path.includes(`user=${next.latest.user_id}`))){setNotice(next.latest);sound('message');}
      lastMessage.current=next.latest?.id||0;
    }catch{}finally{inFlight.current=false;}
  };
  useEffect(()=>{
    lastMessage.current=null;revision.current++;setState({unread:0,latest:null,call:null});setNotice(null);setJoining(null);
    if(!online)return;let socket:WebSocket|null=null,active=true;
    const refresh=()=>{if(active)void refreshSocial();};
    const connect=()=>{if(!supabase&&(!socket||socket.readyState===WebSocket.CLOSED))socket=localSocket('','social',refresh);};
    const connection=crypto.randomUUID();
    const tick=()=>{connect();refresh();if(supabase)void rpc('player_presence',{p_connection:connection,p_online:true}).catch(()=>{});};
    tick();const timer=setInterval(tick,5000);window.addEventListener('focus',tick);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',tick);socket?.close();if(supabase)void rpc('player_presence',{p_connection:connection,p_online:false}).catch(()=>{});};
  },[online,profile.id]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),6500);return()=>clearTimeout(timer);},[notice]);
  const end=async()=>{
    const call=currentCall.current;if(!call)return;revision.current++;setBusy(true);voice.current?.stop();setJoining(null);setVoiceState('off');
    try{await rpc('end_direct_call',{p_call:call.id});await refreshSocial();}catch{toast(t('Не удалось завершить звонок на сервере. Микрофон выключен.','Could not end the server call. Your microphone is off.'));}finally{setBusy(false);}
  };
  useEffect(()=>{
    const call=state.call;
    if(!call||call.status!=='active'||joining!==call.id){voice.current?.stop();voice.current=null;setVoiceState('off');return;}
    const instance=new VoiceChat();voice.current=instance;setVoiceState('connecting');setMuted(false);let active=true;
    void instance.start(call.id,profile.id,call.caller_id===profile.id,status=>{if(active)setVoiceState(status);},'direct_voice').catch(()=>{if(active){latest.current.toast(latest.current.t('Не удалось включить голос. Проверь разрешение микрофона и подключение.','Could not start voice. Check microphone permission and connection.'));void rpc('end_direct_call',{p_call:call.id}).then(()=>refreshSocial()).catch(()=>{});}});
    return()=>{active=false;instance.stop();};
  },[state.call?.id,state.call?.status,joining,profile.id]);
  useEffect(()=>{if(!state.call)setJoining(null);},[state.call?.id]);
  const startCall=async(player:PublicPlayer)=>{
    if(currentCall.current){toast(t('Сначала заверши текущий звонок','End your current call first'));return;}
    if(latest.current.path.startsWith('/play?room=')){toast(t('В комнате используй игровой голосовой чат. Для личного звонка выйди из матча.','Use room voice while playing. Leave the match to make a private call.'));return;}
    revision.current++;setBusy(true);try{const call=await rpc<DirectCall>('start_direct_call',{p_user:player.id});setJoining(call.id);setState(v=>({...v,call}));sound('message');}catch(error){toast((error as Error).message.includes('INVALID_CALL_BUSY')?t('Игрок уже участвует в звонке','This player is already in a call'):t('Не удалось позвонить. Звонки доступны друзьям.','Could not call. Calls are for friends.'));}finally{setBusy(false);}
  };
  const answer=async(accept:boolean)=>{const call=state.call;if(!call)return;revision.current++;setBusy(true);try{await rpc('answer_direct_call',{p_call:call.id,p_accept:accept});if(accept)setJoining(call.id);await refreshSocial();}catch{toast(t('Звонок уже завершён','The call has ended'));void refreshSocial();}finally{setBusy(false);}};
  useEffect(()=>{document.body.classList.toggle('has-direct-call',Boolean(state.call));return()=>document.body.classList.remove('has-direct-call');},[state.call?.id]);
  useEffect(()=>{if(state.call?.status==='ringing'&&state.call.callee_id===profile.id)sound('message');},[state.call?.id,state.call?.status,profile.id]);
  const call=state.call,incoming=call?.status==='ringing'&&call.callee_id===profile.id;
  const inMatch=path.startsWith('/play?room=');
  return <Context.Provider value={{unread:state.unread,call,startCall,refreshSocial}}>{children}{notice&&<div className="direct-notice" role="status"><button onClick={()=>{navigate(`/messages?user=${notice.user_id}`);setNotice(null);}}><MessageCircle size={20}/><span><strong>{notice.username}</strong><small>{t('Новое личное сообщение','New private message')}</small></span></button><button className="icon-button" aria-label={t('Скрыть уведомление','Dismiss notification')} onClick={()=>setNotice(null)}><X size={16}/></button></div>}{call&&<section className="direct-call-bar" aria-label={t('Личный звонок','Private call')}><Avatar name={call.peer.username} src={call.peer.avatar} frame={call.peer.frame}/><div className="call-identity"><strong>{call.peer.username}</strong><small>{incoming?t('Входящий звонок','Incoming call'):call.status==='ringing'?t('Вызываем…','Calling…'):joining!==call.id?t('Звонок открыт в другой вкладке','Call open in another tab'):voiceState==='connected'?t('Голос подключён','Voice connected'):['failed','disconnected','off'].includes(voiceState)?t('Соединение прервано','Connection interrupted'):t('Подключаем голос…','Connecting voice…')}</small></div>{incoming?<><button className="button primary small" disabled={busy||inMatch} onClick={()=>void answer(true)}><Phone size={16}/>{t('Принять','Accept')}</button><button className="icon-button call-end" disabled={busy} aria-label={t('Отклонить звонок','Decline call')} onClick={()=>void answer(false)}><PhoneOff size={19}/></button>{inMatch&&<small className="call-match-note">{t('Ты в матче. Используй голос комнаты или выйди из игры, чтобы ответить.','You are in a match. Use room voice or leave the game to answer.')}</small>}</>:<>{call.status==='active'&&joining===call.id&&<button className="icon-button" aria-pressed={muted} aria-label={muted?t('Включить микрофон','Unmute microphone'):t('Выключить микрофон','Mute microphone')} onClick={()=>{voice.current?.mute(!muted);setMuted(!muted);}}>{muted?<MicOff size={19}/>:<Mic size={19}/>}</button>}{call.status==='active'&&joining!==call.id&&<button className="button small" disabled={inMatch} onClick={()=>setJoining(call.id)}>{t('Подключиться','Join call')}</button>}{voiceState==='tap'&&<button className="button small" onClick={()=>voice.current?.resume()}>{t('Включить звук','Play audio')}</button>}<button className="icon-button call-end" disabled={busy} aria-label={t('Завершить звонок','End call')} onClick={()=>void end()}><PhoneOff size={19}/></button></>}</section>}</Context.Provider>;
}
