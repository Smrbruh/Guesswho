import {useEffect,useRef,useState} from 'react';
import type {GameView} from '../types';
import {read,write} from './storage';
import {rpc} from './supabase';
import {BoardQueue,type BoardReply} from './boardQueue';

export function useBoard(roomId:string|null,storageKey:string,view:GameView|null,onError:()=>void,onSaved:()=>Promise<void>){
  const [closed,setClosed]=useState<string[]>(()=>roomId?[]:read(`${storageKey}:closed`,[]));
  const [saving,setSaving]=useState(false);
  const [lockedTurn,setLockedTurn]=useState('');
  const current=useRef(closed),confirmed=useRef(closed),version=useRef(-1),pending=useRef(false),terminal=useRef(false);
  const queue=useRef<BoardQueue|null>(null);
  const callbacks=useRef({onError,onSaved});callbacks.current={onError,onSaved};
  const turn=`${storageKey}:${view?.room.moves}`;
  useEffect(()=>{
    let alive=true;version.current=-1;terminal.current=false;pending.current=false;
    if(roomId){current.current=[];confirmed.current=[];setClosed([]);setSaving(false);}
    const sync=new BoardQueue(job=>rpc<BoardReply>('set_board',{p_room:job.room,p_closed:job.closed,p_round:job.round,p_move:job.move,p_revision:job.revision}),
      (reply,latest)=>{if(!alive)return;version.current=reply.version;confirmed.current=reply.closed;if(latest){current.current=reply.closed;setClosed(reply.closed);}},
      ()=>{if(!alive)return;version.current=-1;current.current=confirmed.current;setClosed(confirmed.current);callbacks.current.onError();},
      async()=>{if(!alive)return;pending.current=false;await callbacks.current.onSaved();if(alive&&!sync.queued){terminal.current=false;setSaving(false);}});
    queue.current=sync;
    return()=>{alive=false;sync.cancel();};
  },[roomId,storageKey]);
  useEffect(()=>{if(!roomId)write(`${storageKey}:closed`,closed);},[closed,storageKey,roomId]);
  useEffect(()=>{
    if(!roomId||!view||pending.current||view.own_board_version<=version.current)return;
    version.current=view.own_board_version;confirmed.current=view.own_closed||[];current.current=confirmed.current;setClosed(current.current);
  },[roomId,view,storageKey]);
  const update=(next:string[])=>{
    if(terminal.current)return;
    const added=next.some(id=>!current.current.includes(id));
    current.current=next;setClosed(next);
    if(!roomId||!view)return;
    if(added)setLockedTurn(turn);
    pending.current=true;setSaving(true);
    terminal.current=added&&next.length===(view.room.card_count||0)-1;
    queue.current?.enqueue({closed:next,room:roomId,round:view.room.round_number,move:view.room.moves,revision:view.room.deck_revision});
  };
  return {closed,saving,optimisticLocked:lockedTurn===turn,changeClosed:(change:string[]|((previous:string[])=>string[]))=>update(typeof change==='function'?change(current.current):change),flushBoard:()=>queue.current?.flush()||Promise.resolve()};
}
