export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string) {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(value));
}

export function internalEmailForLoginId(value: string) {
  const loginId = normalizeLoginId(value);
  return `${loginId}@login.omnibox.app`;
}
