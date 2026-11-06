const API_ROOT = import.meta.env.VITE_API_ROOT || "/api/v1";
const TOKEN_KEY = "basachai.auth.tokens";

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
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

  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
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

async function refreshTokens(tokens) {
  const { response, data, hasBody } = await send("/auth/token/refresh/", {
    method: "POST",
    body: { refresh: tokens.refresh },
  });
  if (!response.ok) {
    if (!hasBody) throwEmptyResponseError(response);
    throwApiError(data, response);
  }
  if (response.status !== 204 && !hasBody) throwEmptyResponseError(response);
  const next = { access: data.access, refresh: data.refresh };
  writeTokens(next);
  return next;
}

export async function apiRequest(path, options = {}) {
  const { auth = false, ...requestOptions } = options;
  let tokens = auth ? readTokens() : null;
  let { response, data, hasBody } = await send(path, {
    ...requestOptions,
    accessToken: tokens?.access,
  });

  if (auth && response.status === 401 && tokens?.refresh) {
    try {
      tokens = await refreshTokens(tokens);
      ({ response, data, hasBody } = await send(path, {
        ...requestOptions,
        accessToken: tokens.access,
      }));
    } catch {
      clearTokens();
      window.dispatchEvent(new Event("basachai:session-expired"));
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
  let tokens = readTokens();
  if (!tokens?.access) throw new Error(signInMessage);

  const fileUrl = resolveApiUrl(path);
  const requestFile = (accessToken) => fetch(fileUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let response = await requestFile(tokens.access);
  if (response.status === 401 && tokens.refresh) {
    try {
      tokens = await refreshTokens(tokens);
      response = await requestFile(tokens.access);
    } catch {
      clearTokens();
      window.dispatchEvent(new Event("basachai:session-expired"));
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
  const data = await apiRequest("/auth/login/", {
    method: "POST",
    body: { email, password },
  });
  writeTokens({ access: data.access, refresh: data.refresh });
  return data.user;
}

export function requestPasswordReset(email) {
  return apiRequest("/auth/password-reset/", {
    method: "POST",
    body: { email },
  });
}

export function confirmPasswordReset(token, newPassword) {
  return apiRequest("/auth/password-reset/confirm/", {
    method: "POST",
    body: { token, new_password: newPassword },
  });
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
  const tokens = readTokens();
  try {
    if (tokens?.refresh) {
      await apiRequest("/auth/logout/", {
        method: "POST",
        body: { refresh: tokens.refresh },
      });
    }
  } finally {
    clearTokens();
  }
}

export function hasStoredSession() {
  return Boolean(readTokens()?.refresh);
}
