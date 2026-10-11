import {useEffect,useState} from 'react';
import {Bell,BellRing,Check,Smartphone} from 'lucide-react';
import {useApp} from '../context';
import {disablePush,enablePush,isStandalone,needsHomeScreen,pushRegistration,pushRequest,pushSupported} from '../lib/push';

export function PushNotifications(){
  const {t,lang,online,profile,toast}=useApp();
  const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[permission,setPermission]=useState<NotificationPermission>('default');
  const supported=pushSupported(),install=needsHomeScreen()&&!isStandalone();
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      if(!supported||!online){setLoading(false);return;}
      try{
        const grant=Notification.permission,subscription=await (await pushRegistration()).pushManager.getSubscription();
        const status=subscription?await pushRequest<{enabled:boolean}>('status',{endpoint:subscription.endpoint}):{enabled:false};
        if(active){setPermission(grant);setEnabled(grant==='granted'&&status.enabled);}
      }catch{if(active)setEnabled(false);}finally{if(active)setLoading(false);}
    };
    void check();window.addEventListener('focus',check);window.addEventListener('push-change',check);
    return()=>{active=false;window.removeEventListener('focus',check);window.removeEventListener('push-change',check);};
  },[supported,online,profile.id]);
  const toggle=async()=>{
    setBusy(true);
    try{
      if(enabled){await disablePush();setEnabled(false);toast(t('Уведомления на этом устройстве выключены','Notifications disabled on this device'));}
      else{await enablePush(lang);setEnabled(true);toast(t('Уведомления включены. Нажми «Проверить», чтобы получить тестовое.','Notifications enabled. Tap Test to receive a test notification.'));}
    }catch(error){
      const message=(error as Error).message;
      toast(message==='PUSH_DENIED'?t('Разреши уведомления в настройках сайта или телефона','Allow notifications in your site or phone settings'):message==='PUSH_DISMISSED'?t('Разрешение не выдано. Можно попробовать позже.','Permission was not granted. You can try again later.'):t('Не удалось настроить уведомления. Проверь интернет и попробуй ещё раз.','Could not set up notifications. Check your connection and try again.'));
    }finally{setPermission(Notification.permission);setBusy(false);}
  };
  const test=async()=>{
    setBusy(true);try{
      const subscription=await (await pushRegistration()).pushManager.getSubscription();
      if(!subscription)throw new Error('NO_SUBSCRIPTION');
      await pushRequest('test',{endpoint:subscription.endpoint});toast(t('Тестовое уведомление отправлено на это устройство','Test notification sent to this device'));
    }catch{toast(t('Не удалось отправить. Выключи и включи уведомления заново.','Could not send. Turn notifications off and on again.'));}finally{setBusy(false);}
  };
  return <section className="settings-panel push-settings"><div className="setting-heading">{enabled?<BellRing className="lime-text"/>:<Bell/>}<div><h2>{t('Уведомления на телефон','Device notifications')}</h2><p>{t('Сообщения и звонки друзей — даже когда вкладка закрыта. Настройка действует на этом устройстве.','Friend messages and calls, even when the tab is closed. This setting applies to this device.')}</p></div>{enabled&&<Check className="lime-text" aria-label={t('Включены','Enabled')}/>}</div>{install?<p className="push-help"><Smartphone size={20}/><span>{t('На iPhone и iPad: открой сайт в Safari → «Поделиться» → «На экран Домой». Запусти GuessWho с этой иконки и включи уведомления здесь. Нужна iOS / iPadOS 16.4 или новее.','On iPhone and iPad: open the site in Safari → Share → Add to Home Screen. Open GuessWho from its icon and enable notifications here. Requires iOS / iPadOS 16.4 or later.')}</span></p>:!supported?<p className="muted">{t('Открой сайт по HTTPS в браузере с поддержкой push-уведомлений.','Open the HTTPS site in a browser that supports push notifications.')}</p>:<><div className="push-actions"><button className={`button ${enabled?'':'primary'}`} disabled={!online||busy||loading||(!enabled&&permission==='denied')} onClick={()=>void toggle()}><Bell size={17}/>{busy?t('Подожди…','Please wait…'):enabled?t('Выключить','Turn off'):t('Включить уведомления','Enable notifications')}</button>{enabled&&<button className="button" disabled={!online||busy} onClick={()=>void test()}>{t('Проверить','Test')}</button>}</div>{permission==='denied'&&<p className="push-help">{t('Уведомления заблокированы. Разреши их в настройках сайта или в настройках уведомлений телефона, затем вернись сюда.','Notifications are blocked. Allow them in site settings or your phone’s notification settings, then return here.')}</p>}</>}<small className="muted">{t('Текст переписки скрыт в уведомлении. Звонок открывается по нажатию — микрофон включится только после ответа.','Message contents stay private in notifications. Tap a call to open it; your microphone turns on only after you answer.')}</small></section>;
}
