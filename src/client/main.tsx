import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './touch.css';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Link } from './App.tsx';
import { installCollector, reportError } from './bug/collector.ts';

// research R16: Astryx's prebuilt CSS in this order (reset < components < theme), Korean component strings, and the app's
// own Link so Astryx links navigate in-app.
installCollector();
// research R4: errors an error boundary caught (3D falling back to 2D) never reach window 'error'; React's default only logs them.
createRoot(document.getElementById('root')!, {
  onCaughtError: (error) => {
    console.error(error);
    reportError(error);
  },
}).render(
  <StrictMode>
    <Theme theme={neutralTheme}>
      <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }}>
        <LinkProvider component={Link}>
          <App />
        </LinkProvider>
      </InternationalizationProvider>
    </Theme>
  </StrictMode>,
);
