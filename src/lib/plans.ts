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
  shopify: boolean;
};

export const PLAN_DEFINITIONS: Record<PlanKey, PlanDefinition> = {
  lite: {
    key: "lite",
    name: "ライト",
    monthlyPrice: 9800,
    employeeLimit: 3,
    socialPublishing: false,
    instagramDm: false,
    xDm: false,
    aiResponsesPerMonth: 0,
    locationsIncluded: 1,
    shopify: false,
  },
  standard: {
    key: "standard",
    name: "スタンダード",
    monthlyPrice: 29800,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: true,
    aiResponsesPerMonth: 0,
    locationsIncluded: 1,
    shopify: true,
  },
  pro: {
    key: "pro",
    name: "プロ",
    monthlyPrice: 44800,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: true,
    aiResponsesPerMonth: 500,
    locationsIncluded: 1,
    shopify: true,
  },
  premium: {
    key: "premium",
    name: "プレミアム",
    monthlyPrice: 98000,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: true,
    aiResponsesPerMonth: 1500,
    locationsIncluded: 3,
    shopify: true,
  },
  enterprise: {
    key: "enterprise",
    name: "エンタープライズ",
    monthlyPrice: null,
    employeeLimit: null,
    socialPublishing: true,
    instagramDm: true,
    xDm: true,
    aiResponsesPerMonth: 1500,
    locationsIncluded: null,
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
  if (provider === "x") return PLAN_DEFINITIONS[plan].xDm;
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
    shopify: definition.shopify,
  };
}
