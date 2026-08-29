// deno-lint-ignore-file
/* eslint-disable */
// biome-ignore: needed import
import type { OneRouter } from 'one'

declare module 'one' {
  export namespace OneRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: 
        | `/`
        | `/(app)`
        | `/(app)/auth`
        | `/(app)/auth/login`
        | `/(app)/auth/login/password`
        | `/(app)/home`
        | `/(app)/home/(tabs)`
        | `/(app)/home/(tabs)/feed`
        | `/(app)/home/(tabs)/feed/`
        | `/(app)/home/feed`
        | `/(app)/home/feed/`
        | `/(app)/home/settings`
        | `/(app)/home/settings/`
        | `/(app)/home/settings/blocked-users`
        | `/(app)/home/settings/edit-profile`
        | `/_sitemap`
        | `/auth`
        | `/auth/login`
        | `/auth/login/password`
        | `/home`
        | `/home/(tabs)`
        | `/home/(tabs)/feed`
        | `/home/(tabs)/feed/`
        | `/home/feed`
        | `/home/feed/`
        | `/home/settings`
        | `/home/settings/`
        | `/home/settings/blocked-users`
        | `/home/settings/edit-profile`
      DynamicRoutes: 
        | `/(app)/auth/signup/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/(tabs)/feed/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/feed/${OneRouter.SingleRoutePart<T>}`
        | `/auth/signup/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/feed/${OneRouter.SingleRoutePart<T>}`
        | `/home/feed/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: 
        | `/(app)/auth/signup/[method]`
        | `/(app)/home/(tabs)/feed/[postId]`
        | `/(app)/home/feed/[postId]`
        | `/auth/signup/[method]`
        | `/home/(tabs)/feed/[postId]`
        | `/home/feed/[postId]`
      IsTyped: true
      RouteTypes: {
        '/(app)/auth/signup/[method]': RouteInfo<{ method: string }>
        '/(app)/home/(tabs)/feed/[postId]': RouteInfo<{ postId: string }>
        '/(app)/home/feed/[postId]': RouteInfo<{ postId: string }>
        '/auth/signup/[method]': RouteInfo<{ method: string }>
        '/home/(tabs)/feed/[postId]': RouteInfo<{ postId: string }>
        '/home/feed/[postId]': RouteInfo<{ postId: string }>
      }
    }
  }
}

/**
 * Helper type for route information
 */
type RouteInfo<Params = Record<string, never>> = {
  Params: Params
  LoaderProps: { path: string; search?: string; subdomain?: string; params: Params; request?: Request }
}