import { supabase } from "../supabase/client";
const OAUTH_BROKER_INITIATE_PATH = "/~oauth/initiate";
const SUPPORTED_OAUTH_ORIGINS = [
  "https://oauth.lovable.app",
];

const EXPECTED_MESSAGE_TYPE = "authorization_response";

interface OAuthMessageData {
  error?: string;
  error_description?: string;
  state?: string;
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
}

function startWebMessageListener(): {
  cleanup: () => void;
  messagePromise: Promise<OAuthMessageData>;
} {
  let resolvePromise: (value: OAuthMessageData) => void;
  let rejectPromise: (error: Error) => void;

  const promise = new Promise<OAuthMessageData>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const callback = (e: MessageEvent) => {
    const isValidOrigin = SUPPORTED_OAUTH_ORIGINS.some(
      (origin) => e.origin === origin
    );

    if (!isValidOrigin) {
      return;
    }

    const data = e.data;
    if (!data || typeof data !== "object") {
      return;
    }

    if (data.type !== EXPECTED_MESSAGE_TYPE) {
      return;
    }

    resolvePromise(data.response as OAuthMessageData);
  };

  const cleanup = () => {
    window.removeEventListener("message", callback);
  };

  window.addEventListener("message", callback);

  return {
    cleanup,
    messagePromise: promise,
  };
}

function getPopupDimensions(isInIframe: boolean) {
  // In cross-origin iframes, window positioning properties may be restricted
  // Fall back to screen-based centering if browser window position is unavailable
  const hasBrowserPosition =
    window.screenX !== 0 || window.screenY !== 0 || !isInIframe;

  const width = hasBrowserPosition
    ? window.outerWidth * 0.5
    : window.screen.width * 0.5;
  const height = hasBrowserPosition
    ? window.outerHeight * 0.5
    : window.screen.height * 0.5;

  const left = hasBrowserPosition
    ? window.screenX + (window.outerWidth - width) / 2
    : (window.screen.width - width) / 2;
  const top = hasBrowserPosition
    ? window.screenY + (window.outerHeight - height) / 2
    : (window.screen.height - height) / 2;


  return { width, height, left, top };
}

function generateState(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

type OAuthProvider = "google" | "apple";

interface SignInWithOAuthOptions {
  redirect_uri?: string;
}

interface SignInWithOAuthResult {
  error: Error | null;
}

async function signInWithOAuth(
  provider: OAuthProvider,
  opts: SignInWithOAuthOptions = {}
): Promise<SignInWithOAuthResult> {
  let isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch {
    isInIframe = true;
  }

  const state = generateState();
  const redirectUri = opts.redirect_uri ?? window.location.origin;

  const params = new URLSearchParams({
    provider: provider,
    redirect_uri: redirectUri,
    state: state,
  });

  if (!isInIframe) {
    window.location.href = `${OAUTH_BROKER_INITIATE_PATH}?${params.toString()}`;
    return { error: null };
  }

  params.set("response_mode", "web_message");
  
  const url = `${OAUTH_BROKER_INITIATE_PATH}?${params.toString()}`;

  const { messagePromise, cleanup } = startWebMessageListener();

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  let popup: Window | null;
  if (isMobile) {
    popup = window.open(url, "_blank");
  } else {
    const { width, height, left, top } = getPopupDimensions(isInIframe);
    popup = window.open(
      url,
      "oauth",
      `width=${width},height=${height},left=${left},top=${top}`
    );
  }

  if (!popup) {
    cleanup();
    return { error: new Error("Popup was blocked") };
  }

  // Poll for popup closed by user
  let popupCheckInterval: ReturnType<typeof setInterval>;
  const popupClosedPromise = new Promise<never>((_, reject) => {
    popupCheckInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(popupCheckInterval);
        reject(new Error("Sign in was cancelled"));
      }
    }, 500);
  });

  try {
    const data = await Promise.race([messagePromise, popupClosedPromise]);

    if (data.error) {
      if (data.error === "legacy_flow") {
        return { error: new Error("This flow is not supported in Preview mode. Please open the app in a new tab to sign in.") };
      }
      return { error: new Error(data.error_description ?? "Sign in failed") };
    }

    if (data.state !== state) {
      return { error: new Error("State is invalid") };
    }

    if (data.access_token && data.refresh_token) {
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    }

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  } finally {
    clearInterval(popupCheckInterval!);
    cleanup();
    popup?.close();
  }
}

export const auth = {
  signInWithOAuth: signInWithOAuth,
};
