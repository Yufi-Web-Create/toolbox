export type AiRuntimeConfig = {
  provider: "openai" | "gateway";
  apiKey: string;
  model: string;
  source: "stored" | "environment";
};

async function storedAiConfig(): Promise<AiRuntimeConfig | null> {
  const bridgeKey = process.env.OMNIBOX_PROVIDER_BRIDGE_KEY?.trim();
  if (!bridgeKey) return null;

  const bridgeUrl =
    process.env.LINE_BRIDGE_URL?.trim() ||
    "https://omnibox-line-bridge.onrender.com";

  try {
    const response = await fetch(
      new URL("/internal/operator/ai/get", bridgeUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-omnibox-provider-key": bridgeKey,
        },
        body: "{}",
        cache: "no-store",
      },
    );

    const data = (await response.json().catch(() => null)) as
      | {
          configured?: boolean;
          config?: {
            provider?: string;
            apiKey?: string;
            model?: string;
          };
        }
      | null;

    if (!response.ok || data?.configured !== true || !data.config) {
      return null;
    }

    const apiKey =
      typeof data.config.apiKey === "string" ? data.config.apiKey.trim() : "";
    const model =
      typeof data.config.model === "string" && data.config.model.trim()
        ? data.config.model.trim()
        : "gpt-6-luna";

    if (!apiKey) return null;

    return {
      provider: "openai",
      apiKey,
      model,
      source: "stored",
    };
  } catch {
    return null;
  }
}

export async function getAiRuntimeConfig(): Promise<AiRuntimeConfig | null> {
  const stored = await storedAiConfig();
  if (stored) return stored;

  const gatewayToken =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    "";

  if (gatewayToken) {
    const configuredModel = process.env.OPENAI_MODEL?.trim() || "openai/gpt-6-luna";
    return {
      provider: "gateway",
      apiKey: gatewayToken,
      model: configuredModel.includes("/")
        ? configuredModel
        : "openai/" + configuredModel,
      source: "environment",
    };
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      model: process.env.OPENAI_MODEL?.trim() || "gpt-6-luna",
      source: "environment",
    };
  }

  return null;
}
