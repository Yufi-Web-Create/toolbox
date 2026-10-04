export const INSTAGRAM_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "message_reactions",
] as const;

export type InstagramSubscriptionError = {
  message: string;
  type: string | null;
  code: number | null;
  errorSubcode: number | null;
};

export type InstagramSubscriptionResult = {
  ok: boolean;
  success: boolean;
  subscribedFields: string[];
  messagesSubscribed: boolean;
  error: InstagramSubscriptionError | null;
};

function sanitizeMetaError(value: unknown): InstagramSubscriptionError {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const rawError =
    source.error && typeof source.error === "object"
      ? (source.error as Record<string, unknown>)
      : source;

  return {
    message:
      typeof rawError.message === "string"
        ? rawError.message
        : "Meta API request failed",
    type: typeof rawError.type === "string" ? rawError.type : null,
    code: typeof rawError.code === "number" ? rawError.code : null,
    errorSubcode:
      typeof rawError.error_subcode === "number"
        ? rawError.error_subcode
        : null,
  };
}

async function getSubscriptionStatus(
  igUserId: string,
  accessToken: string,
): Promise<InstagramSubscriptionResult> {
  const url = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(igUserId)}/subscribed_apps`,
  );
  url.searchParams.set("fields", "id,name,subscribed_fields");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    return {
      ok: false,
      success: false,
      subscribedFields: [],
      messagesSubscribed: false,
      error: sanitizeMetaError(data),
    };
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  const subscribedFields = [
    ...new Set(
      rows.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const fields = (row as Record<string, unknown>).subscribed_fields;
        return Array.isArray(fields)
          ? fields.filter((field): field is string => typeof field === "string")
          : [];
      }),
    ),
  ];

  return {
    ok: true,
    success: true,
    subscribedFields,
    messagesSubscribed: subscribedFields.includes("messages"),
    error: null,
  };
}

export async function getInstagramSubscriptionStatus(
  igUserId: string,
  accessToken: string,
) {
  return getSubscriptionStatus(igUserId, accessToken);
}

export async function subscribeInstagramAccount(
  igUserId: string,
  accessToken: string,
): Promise<InstagramSubscriptionResult> {
  const url = new URL(
    `https://graph.instagram.com/v26.0/${encodeURIComponent(igUserId)}/subscribed_apps`,
  );
  url.searchParams.set(
    "subscribed_fields",
    INSTAGRAM_SUBSCRIBED_FIELDS.join(","),
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    return {
      ok: false,
      success: false,
      subscribedFields: [],
      messagesSubscribed: false,
      error: sanitizeMetaError(data),
    };
  }

  const postSucceeded = data?.success === true;
  const status = await getSubscriptionStatus(igUserId, accessToken);

  return {
    ...status,
    success: postSucceeded && status.ok && status.messagesSubscribed,
  };
}

export function subscriptionMetadata(
  result: InstagramSubscriptionResult,
  action: "oauth_connect" | "manual_resubscribe" | "status_check",
) {
  return {
    checked_at: new Date().toISOString(),
    action,
    success: result.success,
    subscribed_fields: result.subscribedFields,
    messages_subscribed: result.messagesSubscribed,
    error: result.error,
  };
}
