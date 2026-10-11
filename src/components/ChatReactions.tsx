import type { CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../context';
import { shopItems } from '../lib/game';

const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const emojiPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const collection = shopItems.filter(item => item.type === 'emoji');
const byEmoji = new Map(collection.map(item => [item.emoji, item]));
const basic = ['👍','👀','😂','🤝','😎','😭','😅','🤔','👏','🙃','🎉','💪'];
export type CollectionItem = typeof shopItems[number];
export function reactionMotion(id: string) { return ['emoji-love','emoji-brain'].includes(id) ? 'heart' : ['emoji-rage','emoji-shock','emoji-mindblown'].includes(id) ? 'shake' : id === 'emoji-melt' ? 'melt' : 'bounce'; }
const byId = new Map(collection.map(item => [item.id, item]));
function appearance(id: string): CSSProperties {
  return { '--reaction-color': byId.get(id)?.color || '#c2a3ff' } as CSSProperties;
}

export function CollectionReaction({ item }: { item: CollectionItem }) {
  const { t } = useApp();
  return <div className={`premium-reaction ${item.id === 'emoji-ez' ? 'word-reaction' : ''}`} data-motion={reactionMotion(item.id)} style={appearance(item.id)} aria-label={t(`Реакция из коллекции: ${item.ru}`, `Collection reaction: ${item.en}`)}><span className="premium-reaction-spark" aria-hidden="true">✦</span><span className="premium-reaction-glyph" aria-hidden="true">{item.emoji}</span><span className="premium-reaction-caption"><Sparkles size={11}/>{t(item.ru,item.en)}</span></div>;
}

export function ChatMessageBody({ body }: { body: string }) {
  const item = byEmoji.get(body.trim());
  if (item) return <CollectionReaction item={item}/>;
  return <p>{Array.from(segments.segment(body), ({segment,index}) => emojiPattern.test(segment) ? <span className="chat-emoji" key={index}>{segment}</span> : segment)}</p>;
}

export function ReactionPicker({ owned, busy, onSend, onShop }: { owned: string[]; busy: boolean; onSend: (emoji: string) => void; onShop: () => void }) {
  const { t } = useApp();
  const unlocked=collection.filter(item=>owned.includes(item.id));
  return <div className="reaction-picker"><span>{t('ОБЫЧНЫЕ РЕАКЦИИ','BASIC REACTIONS')}</span><div>{basic.map(emoji=><button disabled={busy} key={emoji} onClick={()=>onSend(emoji)} aria-label={emoji}>{emoji}</button>)}</div>{unlocked.length>0 && <><span className="premium-picker-heading"><Sparkles size={12}/>{t('ТВОЯ КОЛЛЕКЦИЯ','YOUR COLLECTION')}</span><div className="premium-picker-grid">{unlocked.map(item=><button className={`premium-picker-item ${item.id==='emoji-ez'?'word-reaction':''}`} style={appearance(item.id)} disabled={busy} key={item.id} onClick={()=>onSend(item.emoji!)} aria-label={t(`Отправить ${item.ru}`,`Send ${item.en}`)} title={t(item.ru,item.en)}><span>{item.emoji}</span><Sparkles size={10}/></button>)}</div></>}<button className="reaction-shop-link" onClick={onShop}>{t('Больше реакций в магазине','More reactions in the shop')} ↗</button></div>;
}
