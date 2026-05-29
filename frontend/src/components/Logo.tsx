import { cn } from '@/lib/utils';
import { useContext } from 'react';

import { ChainlitContext, useConfig } from '@chainlit/react-client';

import { useTheme } from './ThemeProvider';

interface Props {
  className?: string;
}

const LOGO_CACHE_VERSION = 'bayyan-20260529-2';

function withLogoCacheVersion(src: string) {
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}v=${LOGO_CACHE_VERSION}`;
}

export const Logo = ({ className }: Props) => {
  const { variant } = useTheme();
  const { config } = useConfig();
  const apiClient = useContext(ChainlitContext);
  const logoSrc = apiClient.getLogoEndpoint(
    variant,
    config?.ui?.logo_file_url
  );

  return (
    <img
      src={withLogoCacheVersion(logoSrc)}
      alt="BAYYAN"
      className={cn('logo', className)}
    />
  );
};
