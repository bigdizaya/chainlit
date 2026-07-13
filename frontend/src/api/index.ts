import getRouterBasename from '@/lib/router';
import { toast } from 'sonner';

import {
  ChainlitAPI,
  ClientError,
  withBayyanLocale
} from '@chainlit/react-client';

const devServer =
  (import.meta.env.VITE_API_URL || 'http://localhost:8000') +
  getRouterBasename();
const url = import.meta.env.DEV
  ? devServer
  : window.origin + getRouterBasename();
const serverUrl = new URL(url);

const httpEndpoint = serverUrl.toString();

const isAuthRoute = () => {
  const base = getRouterBasename();
  const path = window.location.pathname;

  return path === base + '/login' || path === base + '/login/callback';
};

const isExpectedAuthError = (error: ClientError) => {
  const status = (error as ClientError & { status?: number }).status;
  const message = error.toString();

  return (
    status === 401 ||
    message.includes('Invalid authentication token') ||
    message.includes('Not authenticated')
  );
};

const on401 = () => {
  if (!isAuthRoute()) {
    // The credentials aren't correct, remove the token and redirect to login
    window.location.href = withBayyanLocale(getRouterBasename() + '/login');
  }
};

const onError = (error: ClientError) => {
  if (isAuthRoute() && isExpectedAuthError(error)) {
    return;
  }

  toast.error(error.toString());
};

class ExtendedChainlitAPI extends ChainlitAPI {
  async shareThread(
    threadId: string,
    isShared: boolean
  ): Promise<{ success: boolean }> {
    const res = await this.put(`/project/thread/share`, {
      threadId,
      isShared
    });
    return res.json();
  }

  connectStreamableHttpMCP(
    sessionId: string,
    name: string,
    url: string,
    headers?: Record<string, string>
  ) {
    // Assumes the backend expects { clientType, name, url }
    return fetch(new URL("mcp", this.httpEndpoint.endsWith("/") ? this.httpEndpoint : `${this.httpEndpoint}/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { 'x-session-id': sessionId } : {})
      },
      body: JSON.stringify({
        clientType: 'streamable-http',
        name,
        url,
        sessionId,
        ...(headers ? { headers } : {})
      })
    }).then(async (res) => {
      const data = await res.json();
      return { success: res.ok, mcp: data.mcp, error: data.detail };
    });
  }
}

export const apiClient = new ExtendedChainlitAPI(
  httpEndpoint,
  'webapp',
  {}, // Optional - additionalQueryParams property.
  on401,
  onError
);
