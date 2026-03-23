export interface Vehicle {
  id: string;
  tenantId: string;
  plate: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  capacityKg: number | null;
  status: string;
  driverId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
