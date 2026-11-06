// Device localStorage (data-model.md "기기 localStorage"). Storage can be missing or throw (private mode, blocked site data);
// then one in-memory key serves this tab (spec Edge Cases).
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
export type View = '3d' | '2d';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function local(): Store {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function read(store: Store, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(store: Store, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // memory fallback below
  }
}

let memoryKey: string | undefined;

export function deviceKey(store: Store = local()): string {
  const saved = read(store, 'rb.deviceKey');
  if (saved && UUID.test(saved)) return saved;
  memoryKey ??= crypto.randomUUID();
  write(store, 'rb.deviceKey', memoryKey);
  return memoryKey;
}

export function readView(store: Store = local()): View | null {
  const v = read(store, 'rb.view');
  return v === '3d' || v === '2d' ? v : null;
}

export const saveView = (view: View, store: Store = local()): void => write(store, 'rb.view', view);
