// Common states (contracts/screens.md "공통 상태").
import { t } from './i18n/t.ts';

export const Loading = () => <p role="status">{t('common.loading')}</p>;

export const NetworkError = ({ onRetry }: { onRetry: () => void }) => (
  <div role="alert">
    <p>{t('common.networkError')}</p>
    <button type="button" onClick={onRetry}>
      {t('common.retry')}
    </button>
  </div>
);

export const RateLimited = ({ retryAfterMs }: { retryAfterMs: number }) => (
  <p role="alert">{t('common.rateLimited', { seconds: Math.ceil(retryAfterMs / 1000) })}</p>
);
