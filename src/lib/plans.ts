export type PlanKey =
  | "lite"
  | "standard"
  | "pro"
  | "premium"
  | "enterprise";

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  monthlyPrice: number | null;
  employeeLimit: number | null;
  socialPublishing: boolean;
  instagramDm: boolean;
  xDm: boolean;
  aiResponsesPerMonth: number;
  locationsIncluded: number | null;
  postsPerMonth: number | null;
  shopify: boolean;
};

export const PLAN_DEFINITIONS: Record<PlanKey, PlanDefinition> = {
  lite: {
    key: "lite",
    name: "ライト",
    monthlyPrice: 0,
    employeeLimit: 3,
    socialPublishing: true,
    instagramDm: true,
    xDm: false,
    aiResponsesPerMonth: 10,
    locationsIncluded: 1,
    postsPerMonth: 2,
    shopify: false,
  },
  standard: {
    key: "standard",
    name: "スタンダード",
    monthlyPrice: 2500,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: false,
    aiResponsesPerMonth: 0,
    locationsIncluded: 1,
    postsPerMonth: null,
    shopify: true,
  },
  pro: {
    key: "pro",
    name: "プロ",
    monthlyPrice: 9800,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: false,
    aiResponsesPerMonth: 500,
    locationsIncluded: 1,
    postsPerMonth: null,
    shopify: true,
  },
  premium: {
    key: "premium",
    name: "プレミアム",
    monthlyPrice: 98000,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: false,
    aiResponsesPerMonth: 1500,
    locationsIncluded: 3,
    postsPerMonth: null,
    shopify: true,
  },
  enterprise: {
    key: "enterprise",
    name: "エンタープライズ",
    monthlyPrice: null,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: false,
    aiResponsesPerMonth: 1500,
    locationsIncluded: null,
    postsPerMonth: null,
    shopify: true,
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return (
    value === "lite" ||
    value === "standard" ||
    value === "pro" ||
    value === "premium" ||
    value === "enterprise"
  );
}

export function planAllowsProvider(plan: PlanKey, provider: string) {
  if (provider === "instagram") return PLAN_DEFINITIONS[plan].instagramDm;
  if (provider === "x") return PLAN_DEFINITIONS[plan].socialPublishing;
  return true;
}

export function planFeatures(plan: PlanKey) {
  const definition = PLAN_DEFINITIONS[plan];
  return {
    socialPublishing: definition.socialPublishing,
    instagramDm: definition.instagramDm,
    xDm: definition.xDm,
    ai: definition.aiResponsesPerMonth > 0,
    aiResponsesPerMonth: definition.aiResponsesPerMonth,
    employeeLimit: definition.employeeLimit,
    locationsIncluded: definition.locationsIncluded,
    postsPerMonth: definition.postsPerMonth,
    shopify: definition.shopify,
  };
}
