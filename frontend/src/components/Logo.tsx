import { cn } from '@/lib/utils';
import { useContext } from 'react';

import { ChainlitContext } from '@chainlit/react-client';

import { useTheme } from './ThemeProvider';

interface Props {
  className?: string;
}

const LOGO_CACHE_VERSION = 'bayyan-20260604-1';

const BAYYAN_LOGOS = {
  dark: '/public/logo_dark.png',
  light: '/public/logo_light.png'
} as const;

function withLogoCacheVersion(src: string) {
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}v=${LOGO_CACHE_VERSION}`;
}

function getBayyanLogoPath(variant: string) {
  return variant === 'dark' ? BAYYAN_LOGOS.dark : BAYYAN_LOGOS.light;
}

export const Logo = ({ className }: Props) => {
  const { variant } = useTheme();
  const apiClient = useContext(ChainlitContext);
  const logoSrc = apiClient.buildEndpoint(getBayyanLogoPath(variant));

  return (
    <img
      src={withLogoCacheVersion(logoSrc)}
      alt="BAYYAN"
      className={cn('logo', className)}
    />
  );
};
