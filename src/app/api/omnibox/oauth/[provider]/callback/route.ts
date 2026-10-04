import { NextResponse } from "next/server";

import {
  exchangeOAuthCode,
  getProviderConfig,
  isOAuthProvider,
} from "../../../../../../lib/integrations/oauth/providers";
import {
  subscribeInstagramAccount,
  subscriptionMetadata,
} from "../../../../../../lib/integrations/instagram-subscription";
import { isPlanKey, planAllowsProvider } from "../../../../../../lib/plans";
import { createClient } from "../../../../../../lib/supabase/server";

type Context = { params: Promise<{ provider: string }> };

function appUrl(
  request: Request,
  params: Record<string, string>,
) {
  const url = new URL("/omnibox.html", new URL(request.url).origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function clearOAuthCookies(response: NextResponse, provider: string) {
  response.cookies.set(`omnibox_oauth_state_${provider}`, "", {
    path: `/api/omnibox/oauth/${provider}`,
    maxAge: 0,
  });
  response.cookies.set(`omnibox_oauth_verifier_${provider}`, "", {
    path: `/api/omnibox/oauth/${provider}`,
    maxAge: 0,
  });
}

export async function GET(request: Request, context: Context) {
  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.redirect(
      appUrl(request, { oauth_error: "unsupported_provider" }),
    );
  }

  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    const response = NextResponse.redirect(
      appUrl(request, {
        oauth_error: "authorization_denied",
        provider: rawProvider,
      }),
    );
    clearOAuthCookies(response, rawProvider);
    return response;
  }

  const code = requestUrl.searchParams.get("code") ?? "";
  const state = requestUrl.searchParams.get("state") ?? "";
  const stateCookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`omnibox_oauth_state_${rawProvider}=`))
      ?.split("=")
      .slice(1)
      .join("=") ?? "";
  const verifierCookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`omnibox_oauth_verifier_${rawProvider}=`))
      ?.split("=")
      .slice(1)
      .join("=") ?? "";

  if (!code || !state || !stateCookie || state !== decodeURIComponent(stateCookie)) {
    const response = NextResponse.redirect(
      appUrl(request, { oauth_error: "invalid_state", provider: rawProvider }),
    );
    clearOAuthCookies(response, rawProvider);
    return response;
  }

  try {
    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claims?.claims?.sub === "string"
        ? claims.claims.sub
        : null;

    if (!userId) {
      throw new Error("login_required");
    }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);

    const organizationId =
      Array.isArray(memberships) && memberships.length === 1
        ? memberships[0].organization_id
        : null;

    const { data: organization } = organizationId
      ? await supabase
          .from("organizations")
          .select("plan_key")
          .eq("id", organizationId)
          .maybeSingle()
      : { data: null };

    const plan = isPlanKey(organization?.plan_key)
      ? organization.plan_key
      : "standard";

    if (!planAllowsProvider(plan, rawProvider)) {
      throw new Error("plan_upgrade_required");
    }

    const config = await getProviderConfig(rawProvider, requestUrl.origin);
    if (!config) {
      throw new Error("provider_not_configured");
    }

    const account = await exchangeOAuthCode(
      config,
      code,
      decodeURIComponent(verifierCookie),
    );

    const { data, error } = await supabase.rpc(
      "omnibox_store_oauth_connection",
      {
        p_provider: rawProvider,
        p_external_account_id: account.externalAccountId,
        p_account_name: account.accountName,
        p_handle: account.handle,
        p_scopes: account.scopes,
        p_secret_json: JSON.stringify(account.tokenBundle),
        p_token_expires_at: account.expiresAt,
        p_metadata: account.metadata,
      },
    );

    if (error || typeof data !== "string") {
      throw new Error("connection_store_failed");
    }

    if (rawProvider === "instagram") {
      try {
        const subscription = await subscribeInstagramAccount(
          account.externalAccountId,
          account.tokenBundle.access_token,
        );

        const metadata = {
          ...account.metadata,
          webhook_subscription: subscriptionMetadata(
            subscription,
            "oauth_connect",
          ),
        };

        const { error: metadataError } = await supabase.rpc(
          "omnibox_store_oauth_connection",
          {
            p_provider: rawProvider,
            p_external_account_id: account.externalAccountId,
            p_account_name: account.accountName,
            p_handle: account.handle,
            p_scopes: account.scopes,
            p_secret_json: JSON.stringify(account.tokenBundle),
            p_token_expires_at: account.expiresAt,
            p_metadata: metadata,
          },
        );

        if (metadataError) {
          console.warn("Instagram webhook subscription metadata update failed", {
            connectionId: data,
          });
        }

        if (subscription.success) {
          console.info("Instagram webhook subscription registered", {
            connectionId: data,
            messagesSubscribed: subscription.messagesSubscribed,
            subscribedFieldCount: subscription.subscribedFields.length,
          });
        } else {
          console.warn("Instagram webhook subscription registration failed", {
            connectionId: data,
            messagesSubscribed: subscription.messagesSubscribed,
            error: subscription.error,
          });
        }
      } catch (subscriptionError) {
        console.warn("Instagram webhook subscription registration failed", {
          connectionId: data,
          error:
            subscriptionError instanceof Error
              ? subscriptionError.message
              : "unknown_error",
        });
      }
    }

    const response = NextResponse.redirect(
      appUrl(request, { oauth: "connected", provider: rawProvider }),
    );
    clearOAuthCookies(response, rawProvider);
    return response;
  } catch (error) {
    console.error("OAuth callback failed", rawProvider, error);
    const response = NextResponse.redirect(
      appUrl(request, { oauth_error: "connection_failed", provider: rawProvider }),
    );
    clearOAuthCookies(response, rawProvider);
    return response;
  }
}
