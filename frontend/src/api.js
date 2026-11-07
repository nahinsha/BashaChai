const API_ROOT = import.meta.env.VITE_API_ROOT || "/api/v1";
const LEGACY_TOKEN_KEY = "basachai.auth.tokens";
let accessToken = null;
let csrfToken = null;
let refreshInFlight = null;

function discardLegacyTokens() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // Authentication remains memory-only when browser storage is unavailable.
  }
}

discardLegacyTokens();

function readAccessToken() {
  return accessToken;
}

function writeAccessToken(token) {
  accessToken = token || null;
}

export function clearTokens() {
  accessToken = null;
  discardLegacyTokens();
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_ROOT}/auth/csrf/`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const data = await response.json();
  if (!response.ok || !data?.csrfToken) {
    throw new Error("The security token could not be initialized. Please try again.");
  }
  csrfToken = data.csrfToken;
  return csrfToken;
}

export function resolveApiUrl(path) {
  if (!path) return path;
  const apiOrigin = new URL(API_ROOT, window.location.origin).origin;
  return new URL(path, apiOrigin).toString();
}

async function send(path, { method = "GET", body, accessToken } = {}) {
  const headers = { Accept: "application/json" };
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (csrfToken && !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase())) {
    headers["X-CSRFToken"] = csrfToken;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
  const text = response.status === 204 ? "" : await response.text();
  const hasBody = text.trim().length > 0;
  const data = hasBody ? JSON.parse(text) : null;
  return { response, data, hasBody };
}

function throwEmptyResponseError(response) {
  const error = new Error(`The server returned an empty response (HTTP ${response.status}).`);
  error.status = response.status;
  throw error;
}

function throwApiError(data, response) {
  const error = new Error(data?.error?.message || "The request could not be completed.");
  error.code = data?.error?.code;
  error.fields = data?.error?.fields || {};
  error.status = response.status;
  throw error;
}

async function refreshTokens() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    await ensureCsrfToken();
    const { response, data, hasBody } = await send("/auth/token/refresh/", {
      method: "POST",
      body: {},
    });
    if (!response.ok) {
      if (!hasBody) throwEmptyResponseError(response);
      throwApiError(data, response);
    }
    if (!hasBody) throwEmptyResponseError(response);
    writeAccessToken(data.access);
    return data.access;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiRequest(path, options = {}) {
  const { auth = false, ...requestOptions } = options;
  let currentAccessToken = auth ? readAccessToken() : null;
  let { response, data, hasBody } = await send(path, {
    ...requestOptions,
    accessToken: currentAccessToken,
  });

  if (auth && response.status === 401) {
    try {
      currentAccessToken = await refreshTokens();
      ({ response, data, hasBody } = await send(path, {
        ...requestOptions,
        accessToken: currentAccessToken,
      }));
    } catch {
      const hadAccessToken = Boolean(currentAccessToken);
      clearTokens();
      if (hadAccessToken) window.dispatchEvent(new Event("basachai:session-expired"));
      throw new Error("Your session has expired. Please sign in again.");
    }
  }

  if (!response.ok) {
    if (!hasBody) throwEmptyResponseError(response);
    throwApiError(data, response);
  }
  if (response.status !== 204 && !hasBody) throwEmptyResponseError(response);
  return data;
}

async function fetchAuthenticatedBlob(path, unavailableLabel, signInMessage) {
  let currentAccessToken = readAccessToken();
  if (!currentAccessToken) throw new Error(signInMessage);

  const fileUrl = resolveApiUrl(path);
  const requestFile = (token) => fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });

  let response = await requestFile(currentAccessToken);
  if (response.status === 401) {
    try {
      currentAccessToken = await refreshTokens();
      response = await requestFile(currentAccessToken);
    } catch {
      const hadAccessToken = Boolean(currentAccessToken);
      clearTokens();
      if (hadAccessToken) window.dispatchEvent(new Event("basachai:session-expired"));
      throw new Error("Your session has expired. Please sign in again.");
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearTokens();
      window.dispatchEvent(new Event("basachai:session-expired"));
      throw new Error("Your session has expired. Please sign in again.");
    }
    throw new Error(`The ${unavailableLabel} could not be loaded (HTTP ${response.status}).`);
  }

  return response.blob();
}

export function fetchAuthenticatedImage(path) {
  return fetchAuthenticatedBlob(path, "listing photo", "Sign in to view this listing photo.");
}

export function fetchAuthenticatedFile(path) {
  return fetchAuthenticatedBlob(path, "attachment", "Sign in to view this attachment.");
}

export async function registerAccount(payload) {
  return apiRequest("/auth/register/", { method: "POST", body: payload });
}

export async function login(email, password) {
  await ensureCsrfToken();
  const data = await apiRequest("/auth/login/", {
    method: "POST",
    body: { email, password },
  });
  writeAccessToken(data.access);
  return data.user;
}

export function requestPasswordReset(email) {
  return apiRequest("/auth/password-reset/", {
    method: "POST",
    body: { email },
  });
}

export async function confirmPasswordReset(token, newPassword) {
  const data = await apiRequest("/auth/password-reset/confirm/", {
    method: "POST",
    body: { token, new_password: newPassword },
  });
  const hadAccessToken = Boolean(readAccessToken());
  clearTokens();
  if (hadAccessToken) window.dispatchEvent(new Event("basachai:session-expired"));
  return data;
}

export function getCurrentUser() {
  return apiRequest("/me/", { auth: true });
}

export function getShortlistComparison(listingIds) {
  const query = new URLSearchParams();
  listingIds.forEach((listingId) => query.append("listing_ids", String(listingId)));
  return apiRequest(`/shortlist/compare/?${query.toString()}`, { auth: true });
}

export async function logout() {
  try {
    await ensureCsrfToken();
    const { response, data, hasBody } = await send("/auth/logout/", {
      method: "POST",
      body: {},
    });
    if (!response.ok) {
      if (!hasBody) throwEmptyResponseError(response);
      throwApiError(data, response);
    }
  } finally {
    clearTokens();
  }
}
