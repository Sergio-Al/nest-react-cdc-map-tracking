import { useState, useMemo } from 'react';
import { Search, MapPin, Plus, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Customer } from '@/types/customer.types';

interface AddStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  existingCustomerIds: number[];
  onAdd: (customerId: number, timeWindowStart?: string, timeWindowEnd?: string) => void;
  isLoading?: boolean;
}

export function AddStopDialog({
  open,
  onOpenChange,
  customers,
  existingCustomerIds,
  onAdd,
  isLoading,
}: AddStopDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');

  const available = useMemo(() => {
    const existing = new Set(existingCustomerIds);
    return customers
      .filter((c) => c.active && c.latitude != null && c.longitude != null)
      .filter((c) => !existing.has(c.id))
      .filter(
        (c) =>
          !search ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.address && c.address.toLowerCase().includes(search.toLowerCase())),
      );
  }, [customers, existingCustomerIds, search]);

  const handleAdd = () => {
    if (selectedId == null) return;
    onAdd(
      selectedId,
      timeStart || undefined,
      timeEnd || undefined,
    );
    // Reset
    setSelectedId(null);
    setSearch('');
    setTimeStart('');
    setTimeEnd('');
    onOpenChange(false);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setSelectedId(null);
      setSearch('');
      setTimeStart('');
      setTimeEnd('');
    }
    onOpenChange(val);
  };

  const selectedCustomer = customers.find((c) => c.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stop</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Customer list */}
        <ScrollArea className="h-48 border rounded-md">
          {available.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No customers available
            </div>
          ) : (
            <div className="p-1">
              {available.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                    selectedId === c.id
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-secondary'
                  }`}
                >
                  <div className="font-medium">{c.name}</div>
                  {c.address && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {c.address}
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {c.customerType}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Time window (optional) */}
        {selectedCustomer && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Time window (optional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="flex-1 text-sm"
                placeholder="From"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="flex-1 text-sm"
                placeholder="To"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selectedId == null || isLoading}>
            <Plus className="w-4 h-4 mr-1" />
            Add Stop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
