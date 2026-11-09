import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Link } from './App.tsx';

// research R16: Astryx's prebuilt CSS in this order (reset < components < theme), Korean component strings, and the app's
// own Link so Astryx links navigate in-app.
createRoot(document.getElementById('root')!).render(
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
