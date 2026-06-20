const INACTIVITY_KEY = 'jawab_last_activity';
const THRESHOLD_MS = 30 * 60 * 1000;
const FRESH_CHAT_URL = '/?new=1';

function readLastActivity() {
  if (typeof window === 'undefined') return 0;

  try {
    return parseInt(window.localStorage.getItem(INACTIVITY_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

export function isBayyanSessionStale(now = Date.now()) {
  const lastActivity = readLastActivity();
  return lastActivity > 0 && now - lastActivity > THRESHOLD_MS;
}

export function markBayyanActivity(now = Date.now()) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(INACTIVITY_KEY, now.toString());
  } catch {
    // Private browsing or blocked storage should not break the app shell.
  }
}

export function redirectToBayyanFreshChat() {
  if (typeof window === 'undefined') return;

  markBayyanActivity();
  if (
    window.location.pathname === '/' &&
    window.location.search.includes('new=1')
  ) {
    return;
  }
  window.location.replace(FRESH_CHAT_URL);
}

export function isBayyanFreshChatRequest() {
  if (typeof window === 'undefined') return false;

  try {
    return new URL(window.location.href).searchParams.get('new') === '1';
  } catch {
    return false;
  }
}
