// ==============================================================================
// Instagram Provider Factory
// Selects Meta Graph API or Mock Provider according to MOCK_INSTAGRAM env var
// ==============================================================================

import type { InstagramProvider } from './provider.interface.ts';
import { MetaInstagramProvider } from './meta-provider.ts';
import { mockInstagramProvider } from './mock-provider.ts';

export function getInstagramProvider(): InstagramProvider {
  const isMock =
    process.env.MOCK_INSTAGRAM === 'true' ||
    !process.env.META_ACCESS_TOKEN ||
    !process.env.INSTAGRAM_ACCOUNT_ID;

  if (isMock) {
    return mockInstagramProvider;
  }

  return new MetaInstagramProvider();
}
