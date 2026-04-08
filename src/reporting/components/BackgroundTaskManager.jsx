import { useEffect, useRef } from 'react';

/**
 * Requests Notification permission on first render.
 * Exposes a triggerNotification helper via the ref pattern.
 */
const hasNotif = typeof Notification !== 'undefined';

export function useNotifications() {
  const permissionRef = useRef(hasNotif ? Notification.permission : 'denied');

  useEffect(() => {
    if (!hasNotif) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        permissionRef.current = p;
      });
    }
  }, []);

  function notify(title, body, onClick) {
    if (!hasNotif || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'reg-search',
      renotify: true,
    });
    if (onClick) n.onclick = () => { onClick(); n.close(); };
  }

  return { notify };
}
