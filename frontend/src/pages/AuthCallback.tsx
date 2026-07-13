import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  useAuth,
  useBayyanLocale,
  withBayyanLocale
} from '@chainlit/react-client';

export default function AuthCallback() {
  const { user, setUserFromAPI } = useAuth();
  const { language } = useBayyanLocale();
  const freshChatUrl = withBayyanLocale('/?new=1', language);
  const navigate = useNavigate();

  // Fetch user in cookie-based oauth.
  useEffect(() => {
    if (!user) setUserFromAPI();
  }, []);

  useEffect(() => {
    if (user) {
      navigate(freshChatUrl, { replace: true });
    }
  }, [user, freshChatUrl]);

  return null;
}
