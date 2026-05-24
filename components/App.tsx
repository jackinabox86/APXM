import { useEffect } from 'react';
import { useGameState } from '../stores/gameState';
import { useMaintenanceDetection } from '../hooks/useMaintenanceDetection';
import { AppShell } from './layout';
import { MaintenanceOverlay } from './MaintenanceOverlay';

export function App() {
  const apexVisible = useGameState((s) => s.apexVisible);
  const unavailable = useMaintenanceDetection();

  // Toggle shadow host between opaque fullscreen (APXM) and collapsed transparent
  // (APEX). The :host(.apex-visible) CSS rule in styles.css handles the visual
  // switch — we just toggle the class on the shadow host element.
  // When showing APEX, make the shadow host semi-transparent so APEX shows through.
  // #container is deliberately NOT modified: changing marginTop or height triggers
  // APEX's layout listeners (ResizeObserver etc.) which navigate the buffer stack.
  // FloatingReturn is position:fixed in the shadow DOM so it overlays correctly
  // without any layout changes to the underlying APEX container.
  useEffect(() => {
    const host = document.querySelector('apxm-overlay') as HTMLElement | null;
    if (host) {
      host.classList.toggle('apex-visible', apexVisible);
      if (apexVisible) {
        host.style.opacity = '0.3';
        host.style.pointerEvents = 'none';
      } else {
        host.style.opacity = '';
        host.style.pointerEvents = '';
      }
    }
  }, [apexVisible]);

  if (unavailable) {
    return <MaintenanceOverlay />;
  }

  return <AppShell />;
}
