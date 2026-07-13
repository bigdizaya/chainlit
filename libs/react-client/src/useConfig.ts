import { useEffect, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';

import { useApi, useAuth } from './api';
import { chatProfileState, configState } from './state';
import { IChainlitConfig } from './types';
import { useBayyanLocale } from './utils/bayyanLocale';

const useConfig = () => {
  const [config, setConfig] = useRecoilState(configState);
  const { isAuthenticated } = useAuth();
  const chatProfile = useRecoilValue(chatProfileState);
  const { language } = useBayyanLocale();
  const prevChatProfileRef = useRef(chatProfile);
  const prevLanguageRef = useRef(language);

  // Build the API URL with optional chat profile parameter
  const apiUrl = isAuthenticated
    ? `/project/settings?language=${language}${
        chatProfile ? `&chat_profile=${encodeURIComponent(chatProfile)}` : ''
      }`
    : null;

  // Always fetch if we don't have config and we're authenticated
  const shouldFetch = isAuthenticated && !config;

  const { data, error, isLoading } = useApi<IChainlitConfig>(
    shouldFetch ? apiUrl : null
  );

  useEffect(() => {
    if (!data) return;
    setConfig(data);
  }, [data, setConfig]);

  // Clear config when chat profile changes to force re-fetch
  useEffect(() => {
    if (prevChatProfileRef.current !== chatProfile) {
      setConfig(undefined);
      prevChatProfileRef.current = chatProfile;
    }
  }, [chatProfile, setConfig]);

  // Settings can contain localized labels, so refresh them with the locale.
  useEffect(() => {
    if (prevLanguageRef.current !== language) {
      setConfig(undefined);
      prevLanguageRef.current = language;
    }
  }, [language, setConfig]);

  return { config, error, isLoading, language };
};

export { useConfig };
