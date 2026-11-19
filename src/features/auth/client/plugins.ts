import { adminClient, magicLinkClient } from 'better-auth/client/plugins'

import { demoLoginClient } from './demoLoginClient'
import { platformClient } from './platformClient'

import type { BetterAuthClientPlugin } from 'better-auth'

export const plugins = [
  adminClient(),
  magicLinkClient(),
  demoLoginClient(),
  platformClient(),
] satisfies BetterAuthClientPlugin[]
