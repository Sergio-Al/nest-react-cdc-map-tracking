export interface Order {
  id: number;
  tenantId: string;
  customerId: number;
  orderNumber: string;
  status: string; // 'pending' | 'confirmed' | 'in_transit' | 'completed' | 'cancelled'
  totalAmount: number;
  deliveryDate: string | null; // 'YYYY-MM-DD'
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
}

export interface CreateOrderDto {
  tenantId: string;
  customerId: number;
  orderNumber?: string;
  status?: string;
  totalAmount?: number;
  deliveryDate?: string;
  notes?: string;
}

export interface UpdateOrderDto {
  customerId?: number;
  orderNumber?: string;
  status?: string;
  totalAmount?: number;
  deliveryDate?: string;
  notes?: string;
}
