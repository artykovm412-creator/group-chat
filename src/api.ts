
const API_URL = "https://inai-col3.fishrungames.com";

export type AuthResponse = {
  access: string;
};

async function apiRequest<T>(
  path: string,
  method: string,
  body?: object
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || `Ошибка сервера: ${response.status}`
    );
  }

  return data as T;
}

export async function registerUser(
  username: string,
  password: string
): Promise<unknown> {
  return apiRequest<unknown>("/api/register/", "POST", {
    username,
    password,
  });
}

export async function loginUser(
  username: string,
  password: string
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/login/", "POST", {
    username,
    password,
  });
}

export async function refreshAccessToken(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/api/token/refresh/", "POST");
}

export async function logoutUser(): Promise<void> {
  await apiRequest<unknown>("/api/logout/", "POST");
}
