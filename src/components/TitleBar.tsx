import { useEffect, useState } from 'react';
import { Minimize2, Minus, X } from 'lucide-react';
import { BRAND } from '../../config/branding';
import { platform } from '../services/platformFacade';

export function TitleBar() {
  const [fullscreen, setFullscreen] = useState(false);
  const hasWindow = platform.capabilities().window;

  useEffect(() => {
    if (!hasWindow) return;
    let active = true;
    let receivedChange = false;
    const unsubscribe = platform.window.onFullscreenChanged((value) => {
      receivedChange = true;
      setFullscreen(value);
    });
    void platform.window.isFullscreen().then((value) => {
      if (active && !receivedChange) setFullscreen(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!hasWindow) return null;

  return (
    <div className="titlebar">
      <span>{BRAND.name}</span>
      {fullscreen && (
        <div className="titlebar-controls">
          <button type="button" className="titlebar-button" title="Minimizar" aria-label="Minimizar"
            onClick={() => void platform.window.minimize()}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <button type="button" className="titlebar-button" title="Sair da tela cheia (F11)" aria-label="Sair da tela cheia"
            onClick={() => void platform.window.leaveFullscreen()}>
            <Minimize2 size={14} aria-hidden="true" />
          </button>
          <button type="button" className="titlebar-button titlebar-button-close" title="Fechar" aria-label="Fechar"
            onClick={() => void platform.window.close()}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
