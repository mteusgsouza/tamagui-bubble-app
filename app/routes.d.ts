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
        | `/(app)/admin`
        | `/(app)/admin/`
        | `/(app)/admin/courses`
        | `/(app)/admin/courses/`
        | `/(app)/admin/people`
        | `/(app)/admin/plans`
        | `/(app)/admin/posts`
        | `/(app)/admin/posts/`
        | `/(app)/auth`
        | `/(app)/auth/login`
        | `/(app)/auth/login/password`
        | `/(app)/home`
        | `/(app)/home/(tabs)`
        | `/(app)/home/(tabs)/courses`
        | `/(app)/home/(tabs)/courses/`
        | `/(app)/home/(tabs)/feed`
        | `/(app)/home/(tabs)/feed/`
        | `/(app)/home/courses`
        | `/(app)/home/courses/`
        | `/(app)/home/feed`
        | `/(app)/home/feed/`
        | `/(app)/home/settings`
        | `/(app)/home/settings/`
        | `/(app)/home/settings/blocked-users`
        | `/(app)/home/settings/edit-profile`
        | `/_sitemap`
        | `/admin`
        | `/admin/`
        | `/admin/courses`
        | `/admin/courses/`
        | `/admin/people`
        | `/admin/plans`
        | `/admin/posts`
        | `/admin/posts/`
        | `/auth`
        | `/auth/login`
        | `/auth/login/password`
        | `/home`
        | `/home/(tabs)`
        | `/home/(tabs)/courses`
        | `/home/(tabs)/courses/`
        | `/home/(tabs)/feed`
        | `/home/(tabs)/feed/`
        | `/home/courses`
        | `/home/courses/`
        | `/home/feed`
        | `/home/feed/`
        | `/home/settings`
        | `/home/settings/`
        | `/home/settings/blocked-users`
        | `/home/settings/edit-profile`
      DynamicRoutes: 
        | `/(app)/admin/courses/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/admin/posts/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/auth/signup/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/(tabs)/courses/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/(tabs)/courses/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/(tabs)/feed/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/courses/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/courses/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/(app)/home/feed/${OneRouter.SingleRoutePart<T>}`
        | `/admin/courses/${OneRouter.SingleRoutePart<T>}`
        | `/admin/posts/${OneRouter.SingleRoutePart<T>}`
        | `/auth/signup/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/courses/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/courses/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/(tabs)/feed/${OneRouter.SingleRoutePart<T>}`
        | `/home/courses/${OneRouter.SingleRoutePart<T>}`
        | `/home/courses/${OneRouter.SingleRoutePart<T>}/${OneRouter.SingleRoutePart<T>}`
        | `/home/feed/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: 
        | `/(app)/admin/courses/[courseId]`
        | `/(app)/admin/posts/[postId]`
        | `/(app)/auth/signup/[method]`
        | `/(app)/home/(tabs)/courses/[courseSlug]`
        | `/(app)/home/(tabs)/courses/[courseSlug]/[lessonId]`
        | `/(app)/home/(tabs)/feed/[postId]`
        | `/(app)/home/courses/[courseSlug]`
        | `/(app)/home/courses/[courseSlug]/[lessonId]`
        | `/(app)/home/feed/[postId]`
        | `/admin/courses/[courseId]`
        | `/admin/posts/[postId]`
        | `/auth/signup/[method]`
        | `/home/(tabs)/courses/[courseSlug]`
        | `/home/(tabs)/courses/[courseSlug]/[lessonId]`
        | `/home/(tabs)/feed/[postId]`
        | `/home/courses/[courseSlug]`
        | `/home/courses/[courseSlug]/[lessonId]`
        | `/home/feed/[postId]`
      IsTyped: true
      RouteTypes: {
        '/(app)/admin/courses/[courseId]': RouteInfo<{ courseId: string }>
        '/(app)/admin/posts/[postId]': RouteInfo<{ postId: string }>
        '/(app)/auth/signup/[method]': RouteInfo<{ method: string }>
        '/(app)/home/(tabs)/courses/[courseSlug]': RouteInfo<{ courseSlug: string }>
        '/(app)/home/(tabs)/courses/[courseSlug]/[lessonId]': RouteInfo<{ courseSlug: string; lessonId: string }>
        '/(app)/home/(tabs)/feed/[postId]': RouteInfo<{ postId: string }>
        '/(app)/home/courses/[courseSlug]': RouteInfo<{ courseSlug: string }>
        '/(app)/home/courses/[courseSlug]/[lessonId]': RouteInfo<{ courseSlug: string; lessonId: string }>
        '/(app)/home/feed/[postId]': RouteInfo<{ postId: string }>
        '/admin/courses/[courseId]': RouteInfo<{ courseId: string }>
        '/admin/posts/[postId]': RouteInfo<{ postId: string }>
        '/auth/signup/[method]': RouteInfo<{ method: string }>
        '/home/(tabs)/courses/[courseSlug]': RouteInfo<{ courseSlug: string }>
        '/home/(tabs)/courses/[courseSlug]/[lessonId]': RouteInfo<{ courseSlug: string; lessonId: string }>
        '/home/(tabs)/feed/[postId]': RouteInfo<{ postId: string }>
        '/home/courses/[courseSlug]': RouteInfo<{ courseSlug: string }>
        '/home/courses/[courseSlug]/[lessonId]': RouteInfo<{ courseSlug: string; lessonId: string }>
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