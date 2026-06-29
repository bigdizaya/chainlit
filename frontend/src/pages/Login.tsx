import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LoginForm } from '@/components/LoginForm';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/components/ThemeProvider';

import { useQuery } from 'hooks/query';

import { ChainlitContext, useAuth } from 'client-types/*';

export const LoginError = new Error(
  'Error logging in. Please try again later.'
);

const FRESH_CHAT_URL = '/?new=1';

export default function Login() {
  const query = useQuery();
  const { data: config, user, setUserFromAPI } = useAuth();
  const [error, setError] = useState('');
  const apiClient = useContext(ChainlitContext);
  const navigate = useNavigate();
  const { variant } = useTheme();
  const isDarkMode = variant === 'dark';

  const handleCookieAuth = (json: any): void => {
    if (json?.success != true) throw LoginError;

    // Validate login cookie and get user data.
    setUserFromAPI();
  };

  const handleAuth = async (
    jsonPromise: Promise<any>,
    redirectURL?: string
  ) => {
    try {
      const json = await jsonPromise;

      handleCookieAuth(json);

      if (redirectURL) {
        navigate(redirectURL);
      }
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleHeaderAuth = async () => {
    const jsonPromise = apiClient.headerAuth();

    await handleAuth(jsonPromise, FRESH_CHAT_URL);
  };

  const handlePasswordLogin = async (email: string, password: string) => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const jsonPromise = apiClient.passwordAuth(formData);
    await handleAuth(jsonPromise);
  };

  useEffect(() => {
    setError(query.get('error') || '');
  }, [query]);

  useEffect(() => {
    if (!config) {
      return;
    }
    if (!config.requireLogin) {
      navigate(FRESH_CHAT_URL, { replace: true });
    }
    if (config.headerAuth && !user) {
      handleHeaderAuth();
    }
    if (user) {
      navigate(FRESH_CHAT_URL, { replace: true });
    }
  }, [config, user]);

  return (
    <div className="grid min-h-[100dvh] overflow-y-auto lg:grid-cols-2">
      <div className="flex min-h-[100dvh] flex-col gap-3 px-6 pb-8 pt-5 sm:gap-4 sm:pt-7 md:p-10">
        <div className="flex shrink-0 justify-center gap-2 md:justify-start">
          <Logo className="w-[142px] sm:w-[150px]" />
        </div>
        <div className="flex flex-1 items-start justify-center pt-10 sm:pt-12 md:items-center md:pt-0">
          <div className="w-full max-w-xs">
            <LoginForm
              error={error}
              callbackUrl={FRESH_CHAT_URL}
              providers={config?.oauthProviders || []}
              onPasswordSignIn={
                config?.passwordAuth ? handlePasswordLogin : undefined
              }
              onOAuthSignIn={async (provider: string) => {
                window.location.href = apiClient.getOAuthEndpoint(provider);
              }}
            />
          </div>
        </div>
      </div>
      {!config?.headerAuth ? (
        <div className="relative hidden bg-muted lg:block overflow-hidden">
          <img
            src={
              config?.ui?.login_page_image ||
              apiClient.buildEndpoint('/favicon')
            }
            alt="Image"
            className={`absolute inset-0 h-full w-full object-cover ${
              isDarkMode
                ? config?.ui?.login_page_image_dark_filter ||
                  'brightness-[0.2] grayscale'
                : config?.ui?.login_page_image_filter || ''
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}
