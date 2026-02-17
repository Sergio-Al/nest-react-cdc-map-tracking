export interface Customer {
  id: number;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
  customerType: string;
  active: boolean;
  syncedAt: string;
}
