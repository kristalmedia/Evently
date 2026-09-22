"use client";

import { createAuthClient } from "better-auth/react";
import { apiPath } from "./api-path";

// better-auth's client builds its own request URLs independently of Next's
// router — it has no idea this app is mounted under NEXT_BASE_PATH (e.g.
// "/evently"). Left to its default, it POSTs to "/api/auth/sign-in/social"
// at the domain root, which 404s whenever the app isn't served from "/".
// Explicitly pointing baseURL at the basePath-prefixed origin fixes that.
//
// Guarded for SSR: this module also evaluates once during the server render
// of this "use client" component, where `window` doesn't exist. That pass's
// authClient instance is never actually used to make a request (all calls
// happen from a browser event handler), so falling back to a relative
// "/api/auth" there is harmless — the browser's own module instance (a
// separate execution of this file in the client bundle) picks up the
// correct absolute URL once hydrated.
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? `${window.location.origin}${apiPath("/api/auth")}` : undefined,
});
