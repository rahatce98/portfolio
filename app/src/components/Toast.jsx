import { useEffect, useState } from 'react';

/* Tiny global toast. Anything can call toast('text'); one host renders it. */

const bus = new EventTarget();
export function toast(text) {
  bus.dispatchEvent(new CustomEvent('t', { detail: text }));
}

export default function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const id = Math.random();
      setItems((l) => [...l.slice(-2), { id, text: e.detail }]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 2600);
    };
    bus.addEventListener('t', on);
    return () => bus.removeEventListener('t', on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          <i />
          {t.text}
        </div>
      ))}
    </div>
  );
}
