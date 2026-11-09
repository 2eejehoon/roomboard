// Common states (contracts/screens.md "공통 상태"). The wrappers carry the live-region roles Astryx's Spinner and Banner leave out.
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Spinner } from '@astryxdesign/core/Spinner';
import { t } from './i18n/t.ts';

export const Loading = () => (
  <div role="status">
    <Spinner label={t('common.loading')} />
  </div>
);

export const NetworkError = ({ onRetry }: { onRetry: () => void }) => (
  <div role="alert">
    <Banner status="error" title={t('common.networkError')} endContent={<Button label={t('common.retry')} variant="secondary" onClick={onRetry} />} />
  </div>
);

export const RateLimited = ({ retryAfterMs }: { retryAfterMs: number }) => (
  <div role="alert">
    <Banner status="warning" title={t('common.rateLimited', { seconds: Math.ceil(retryAfterMs / 1000) })} />
  </div>
);
