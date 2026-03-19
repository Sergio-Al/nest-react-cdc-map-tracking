import { useState } from 'react';
import { Plus, Building2, MapPin, Phone, Mail, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers, useCreateCustomer } from '@/hooks/api/useRouteBuilder';
import { useAuthStore } from '@/stores/auth.store';
import { CreateCustomerDialog } from '@/components/customers/CreateCustomerDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CreateCustomerDto } from '@/hooks/api/useRouteBuilder';

const TYPE_STYLES: Record<string, string> = {
  retail: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  wholesale: 'bg-purple-500/15 text-purple-600 border-purple-500/20',
  distributor: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  other: 'bg-secondary text-muted-foreground border-border',
};

export default function CustomersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const user = useAuthStore((s) => s.user);
  const { data: customers = [], isLoading, error } = useCustomers();
  const createCustomer = useCreateCustomer();

  const handleCreate = async (dto: CreateCustomerDto) => {
    try {
      await createCustomer.mutateAsync(dto);
      setPendingNames((prev) => [...prev, dto.name]);
      // Remove from pending after CDC propagation window
      setTimeout(() => {
        setPendingNames((prev) => prev.filter((n) => n !== dto.name));
      }, 5000);
      toast.success(`Customer "${dto.name}" queued — will appear shortly via CDC sync`, {
        duration: 5000,
      });
    } catch {
      toast.error('Failed to create customer');
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">
              Manage your customer directory
            </p>
          </div>
        </div>
        {(user?.role === 'admin' || user?.role === 'dispatcher') && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Customer
          </Button>
        )}
      </div>

      {/* Pending notice */}
      {pendingNames.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <strong>{pendingNames.join(', ')}</strong> — syncing via CDC, will appear in a few
            seconds.
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 text-muted-foreground">
          Failed to load customers.
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No customers yet.</p>
          {(user?.role === 'admin' || user?.role === 'dispatcher') && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first customer
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Contact
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="border-border/50">
                  <TableCell>
                    <div className="font-medium">{customer.name}</div>
                    {customer.address && (
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {customer.address}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={TYPE_STYLES[customer.customerType] ?? TYPE_STYLES.other}
                    >
                      {customer.customerType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {customer.latitude != null && customer.longitude != null ? (
                      <span className="font-mono text-xs">
                        {customer.latitude.toFixed(4)}, {customer.longitude.toFixed(4)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {customer.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </span>
                      )}
                      {customer.email && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </span>
                      )}
                      {!customer.phone && !customer.email && '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        customer.active ? 'bg-green-500' : 'bg-muted-foreground/40'
                      }`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateCustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantId={user?.tenantId ?? ''}
        onSubmit={handleCreate}
        isLoading={createCustomer.isPending}
      />
    </div>
  );
}
