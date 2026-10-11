import { useState } from 'react';
import { Check, LockKeyhole, Sparkles, Shield, ArrowRight, Play, RotateCcw } from 'lucide-react';
import { useApp } from '../context';
import { PageHeading, Coin, Avatar, Modal } from '../components/ui';
import { CollectionReaction } from '../components/ChatReactions';
import { shopItems } from '../lib/game';
import { rpc } from '../lib/supabase';
import type { Profile } from '../types';

const newItems = new Set(['emoji-67','frame-aurora','frame-rose','frame-inferno','emoji-love','emoji-mindblown','emoji-party','emoji-melt','emoji-shock','emoji-spy']);
const emotions = new Set(['emoji-love','emoji-mindblown','emoji-party','emoji-melt','emoji-shock','emoji-cry','emoji-rage','emoji-yawn','emoji-smirk','emoji-sus']);

export default function Shop() {
  const { t, profile, setProfile, online, toast, navigate } = useApp();
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const [busy, setBusy] = useState(false);
  const buy = async () => { setBusy(true); try { setProfile(await rpc<Profile>('buy_item', { p_item: pending })); toast(t('Пополнение коллекции!', 'Added to your collection!')); setPending(null); } catch { toast(t('Не удалось купить. Проверь баланс и подключение.', 'Purchase failed. Check your balance and connection.')); } finally { setBusy(false); } };
  const equip = async (id: string) => { setBusy(true); try { setProfile(await rpc<Profile>('equip_frame', { p_item: id })); } catch { toast(t('Не удалось применить рамку', 'Could not equip frame')); } finally { setBusy(false); } };
  const item = shopItems.find(i => i.id === pending);
  const previewItem = shopItems.find(i => i.id === preview);
  const visible = shopItems.filter(i => filter === 'all' || i.type === filter || (filter === 'owned' && profile.owned.includes(i.id)) || (filter === 'new' && newItems.has(i.id)) || (filter === 'emotion' && emotions.has(i.id)));
  return <>
    <PageHeading eyebrow="THE STYLE LAB" title={t('Покажи характер.', 'Show your personality.')} text={t('Живые эмоции, выразительные реакции и рамки, которые заметят.', 'Animated emotions, expressive reactions and frames that stand out.')}><div className="balance-pill"><span>{t('Твой баланс', 'Your balance')}</span><Coin amount={profile.coins}/></div></PageHeading>
    <div className="shop-banner emotion-banner"><div><span className="eyebrow"><Sparkles size={14}/> {t('НОВАЯ КОЛЛЕКЦИЯ · MOOD', 'NEW COLLECTION · MOOD')}</span><h2>{t('Один стикер. Тысяча эмоций.', 'One sticker. A thousand feelings.')}</h2><p>{t('7 новых реакций и 3 новые рамки. Посмотри анимацию перед покупкой.', '7 new reactions and 3 new frames. Preview the animation before buying.')}</p><button className="button primary small" onClick={()=>setFilter('new')}>{t('Смотреть новинки','Explore new items')}<ArrowRight size={16}/></button></div><div className="shop-mood-display" aria-hidden="true"><span>🤯</span><span>🥰</span><span>🥳</span></div></div>
    <div className="list-toolbar shop-toolbar"><div className="tabs">{[['all','Всё','All items'],['new','Новинки','New'],['emotion','Эмоции','Emotions'],['frame','Рамки','Frames'],['emoji','Все реакции','All reactions'],['owned','Моя коллекция','My collection']].map(([id,ru,en]) => <button key={id} className={filter === id ? 'selected' : ''} aria-pressed={filter===id} onClick={() => setFilter(id)}>{t(ru,en)}</button>)}</div><span className="subtle-label"><Shield size={14}/>{t('Только косметика. Честная игра.', 'Just cosmetics. Always fair.')}</span></div>
    <div className="shop-grid">{visible.map(i => {
      const owned = profile.owned.includes(i.id), equipped = profile.frame === i.id;
      return <article className="shop-card" key={i.id}>
        <div className={`item-art ${i.rarity}`} style={{ '--item-color': i.color } as React.CSSProperties}><span className="rarity">{i.rarity === 'legendary' ? t('ЛЕГЕНДАРНЫЙ', 'LEGENDARY') : i.rarity === 'epic' ? t('ЭПИЧЕСКИЙ', 'EPIC') : t('РЕДКИЙ', 'RARE')}</span>{newItems.has(i.id) && <span className="item-new">NEW</span>}{i.type === 'frame' ? <Avatar name={profile.username} src={profile.avatar} frame={i.id} large/> : <CollectionReaction item={i}/>}<span className="art-dot dot-one"/><span className="art-dot dot-two"/></div>
        <div className="item-info"><small>{i.type === 'frame' ? t('РАМКА ПРОФИЛЯ', 'PROFILE FRAME') : t('АНИМИРОВАННАЯ РЕАКЦИЯ', 'ANIMATED REACTION')}</small><h3>{t(i.ru,i.en)}</h3><button className="item-preview" onClick={()=>{setPreview(i.id);setReplay(0);}} aria-label={t(`Предпросмотр: ${i.ru}`,`Preview: ${i.en}`)}><Play size={13}/>{t('Посмотреть','Preview')}</button><div>{owned ? <button className={`button full ${equipped ? 'equipped' : ''}`} disabled={busy || equipped || i.type === 'emoji'} onClick={() => void equip(i.id)}><Check size={16}/>{equipped ? t('Используется','Equipped') : i.type === 'emoji' ? t('В коллекции','Owned') : t('Применить','Equip')}</button> : <button className="button full" disabled={!online || busy || profile.coins < i.price} onClick={() => setPending(i.id)}>{profile.coins < i.price ? <LockKeyhole size={15}/> : null}<span>{t('Купить', 'Get item')}</span><Coin amount={i.price}/></button>}</div></div>
      </article>;
    })}</div>
    {filter === 'owned' && !visible.length && <div className="empty-state"><Sparkles size={36}/><h2>{t('Начало новой коллекции', 'The start of a collection')}</h2><p>{t('Выиграй онлайн-дуэль и заработай первые монеты.', 'Win an online duel to earn your first coins.')}</p><button className="button" onClick={() => navigate('/servers')}>{t('На арену','To the arena')}<ArrowRight size={16}/></button></div>}
    <p className="shop-footnote">{t('50 монет за онлайн-победу. Матч от 30 секунд, минимум 2 переданных хода, до 20 наград в сутки. Реальные деньги не нужны.', '50 coins per online win. Matches require 30 seconds and 2 passed turns; up to 20 rewards daily. No real money needed.')}</p>
    {previewItem && <Modal title={t(previewItem.ru,previewItem.en)} onClose={()=>setPreview(null)}><div className="collection-preview">{previewItem.type==='emoji' ? <CollectionReaction key={replay} item={previewItem}/> : <Avatar name={profile.username} src={profile.avatar} frame={previewItem.id} large/>}</div><p className="muted">{previewItem.type==='emoji' ? t('Так реакция выглядит в чате. Анимации учитывают настройку уменьшения движения.','This is how the reaction looks in chat. Animations respect reduced motion settings.') : t('Рамка появится у твоего аватара в профиле и матчах.','This frame appears around your avatar in your profile and matches.')}</p>{previewItem.type==='emoji' && <button className="button full" onClick={()=>setReplay(n=>n+1)}><RotateCcw size={16}/>{t('Повторить анимацию','Replay animation')}</button>}</Modal>}
    {item && <Modal title={t('Добавить в коллекцию?', 'Add to your collection?')} onClose={() => setPending(null)}><div className="collection-preview">{item.type==='emoji' ? <CollectionReaction item={item}/> : <Avatar name={profile.username} src={profile.avatar} frame={item.id} large/>}</div><p>{t(item.ru, item.en)}</p><div className="purchase-summary"><span>{t('Стоимость', 'Price')}</span><Coin amount={item.price}/></div><button className="button primary full" disabled={busy} onClick={() => void buy()}>{busy ? t('Покупаем…','Purchasing…') : t('Подтвердить покупку','Confirm purchase')}</button></Modal>}
  </>;
}
