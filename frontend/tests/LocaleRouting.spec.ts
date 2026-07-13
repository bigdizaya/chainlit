import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readFrontendFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('BAYYAN locale routing', () => {
  it('applies and remembers an explicit URL locale before stored preferences', () => {
    const source = readFrontendFile('index.html');
    const queryLookup = source.indexOf("searchParams.get('lang')");
    const primaryStorageLookup = source.indexOf(
      "localStorage.getItem('bayyan_locale')"
    );

    expect(queryLookup).toBeGreaterThan(-1);
    expect(primaryStorageLookup).toBeGreaterThan(-1);
    expect(queryLookup).toBeLessThan(primaryStorageLookup);
    expect(source).toMatch(/localStorage\.setItem\(\s*'bayyan_locale'/);
    expect(source).toMatch(
      /localStorage\.setItem\(\s*'jawab_lang',\s*normalizedRequest\s*\)/
    );
  });

  it('keeps the active locale through login and post-login navigation', () => {
    const appWrapper = readFrontendFile('src/AppWrapper.tsx');
    const login = readFrontendFile('src/pages/Login.tsx');
    const callback = readFrontendFile('src/pages/AuthCallback.tsx');
    const api = readFrontendFile('src/api/index.ts');

    expect(appWrapper).toContain(
      "withBayyanLocale(getRouterBasename() + '/login', languageInUse)"
    );
    expect(login).toContain("withBayyanLocale('/?new=1', language)");
    expect(login).toContain('apiClient.getOAuthEndpoint(provider)');
    expect(login).toContain('window.location.href = withBayyanLocale(');
    expect(callback).toContain("withBayyanLocale('/?new=1', language)");
    expect(api).toContain('window.location.href = withBayyanLocale(');
    expect(api).toContain("getRouterBasename() + '/login'");
  });
});
