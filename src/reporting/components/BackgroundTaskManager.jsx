import { useEffect, useRef } from 'react';

/**
 * Requests Notification permission on first render.
 * Exposes a triggerNotification helper via the ref pattern.
 */
export function useNotifications() {
  const permissionRef = useRef(Notification.permission);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        permissionRef.current = p;
      });
    }
  }, []);

  /**
   * Fire a desktop notification when a background task completes.
   * @param {string} title - Notification heading
   * @param {string} body  - Detail text
   * @param {Function} [onClick] - Called when user clicks the notification
   */
  function notify(title, body, onClick) {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'reg-search',          // replaces previous notification of same tag
      renotify: true,
    });
    if (onClick) n.onclick = () => { onClick(); n.close(); };
  }

  return { notify };
}
