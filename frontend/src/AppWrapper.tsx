import { BAYYAN_TRANSLATIONS } from '@/i18n/bayyanTranslations';
import getRouterBasename from '@/lib/router';
import App from 'App';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  applyBayyanDocumentLocale,
  normalizeBayyanLocale,
  useApi,
  useAuth,
  useChatInteract,
  useConfig
} from '@chainlit/react-client';

export default function AppWrapper() {
  const [translationLoaded, setTranslationLoaded] = useState(false);
  const { isAuthenticated, isReady } = useAuth();
  const { language: languageInUse } = useConfig();
  const { i18n } = useTranslation();
  const { windowMessage } = useChatInteract();

  function handleChangeLanguage(languageBundle: any): void {
    const locale = normalizeBayyanLocale(languageInUse) || 'fr';
    i18n.addResourceBundle(
      languageInUse,
      'translation',
      languageBundle,
      true,
      true
    );
    i18n.addResourceBundle(
      languageInUse,
      'translation',
      BAYYAN_TRANSLATIONS[locale],
      true,
      true
    );
    i18n.changeLanguage(languageInUse);
  }

  const { data: translations } = useApi<any>(
    `/project/translations?language=${languageInUse}`
  );

  useEffect(() => {
    applyBayyanDocumentLocale(languageInUse);
    setTranslationLoaded(false);
  }, [languageInUse]);

  useEffect(() => {
    if (!translations) return;
    handleChangeLanguage(translations.translation);
    setTranslationLoaded(true);
  }, [translations, languageInUse]);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      windowMessage(event.data);
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [windowMessage]);

  if (!translationLoaded) return null;

  if (
    isReady &&
    !isAuthenticated &&
    window.location.pathname !== getRouterBasename() + '/login' &&
    window.location.pathname !== getRouterBasename() + '/login/callback'
  ) {
    window.location.replace(getRouterBasename() + '/login');
    return null;
  }
  return <App />;
}
