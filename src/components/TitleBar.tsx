import { useEffect, useState } from 'react';
import { Minimize2, Minus, X } from 'lucide-react';
import { BRAND } from '../../config/branding';
import { db } from '../services/lanDatabase';

export function TitleBar() {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    let active = true;
    let receivedChange = false;
    const unsubscribe = db.window.onFullscreenChanged((value) => {
      receivedChange = true;
      setFullscreen(value);
    });
    void db.window.isFullscreen().then((value) => {
      if (active && !receivedChange) setFullscreen(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="titlebar">
      <span>{BRAND.name}</span>
      {fullscreen && (
        <div className="titlebar-controls">
          <button type="button" className="titlebar-button" title="Minimizar" aria-label="Minimizar"
            onClick={() => void db.window.minimize()}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <button type="button" className="titlebar-button" title="Sair da tela cheia (F11)" aria-label="Sair da tela cheia"
            onClick={() => void db.window.leaveFullscreen()}>
            <Minimize2 size={14} aria-hidden="true" />
          </button>
          <button type="button" className="titlebar-button titlebar-button-close" title="Fechar" aria-label="Fechar"
            onClick={() => void db.window.close()}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
