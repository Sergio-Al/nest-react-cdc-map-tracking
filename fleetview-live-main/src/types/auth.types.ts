export type UserRole = 'admin' | 'dispatcher' | 'driver';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  driverId: string | null;
}

/** Fully-resolved preferences (user override → tenant default → system). */
export interface EffectiveSettings {
  timezone: string;
  locale: string;
  dateFormat: string;
  numberFormat: string;
  units: 'metric' | 'imperial' | string;
  defaultReportPreset: string;
  theme: 'light' | 'dark' | 'system' | string;
  density: 'comfortable' | 'compact' | string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: User;
  settings: EffectiveSettings;
}

/** GET /auth/profile — user fields plus resolved settings. */
export interface ProfileResponse extends User {
  settings: EffectiveSettings;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
