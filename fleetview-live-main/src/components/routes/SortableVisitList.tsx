import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableVisitCard } from './SortableVisitCard';
import type { PlannedVisit } from '@/types/visit.types';
import type { Customer } from '@/types/customer.types';

interface SortableVisitListProps {
  visits: PlannedVisit[];
  customers: Customer[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDeleteVisit: (visitId: string) => void;
  disabled?: boolean;
}

export function SortableVisitList({
  visits,
  customers,
  onReorder,
  onDeleteVisit,
  disabled,
}: SortableVisitListProps) {
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = visits.findIndex((v) => v.id === active.id);
      const toIndex = visits.findIndex((v) => v.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1) {
        onReorder(fromIndex, toIndex);
      }
    },
    [visits, onReorder],
  );

  if (visits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
        <div>
          <p className="font-medium">No stops yet</p>
          <p className="mt-1">Add a stop to begin building the route</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[]}
    >
      <SortableContext items={visits.map((v) => v.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {visits.map((visit, index) => (
            <SortableVisitCard
              key={visit.id}
              visit={visit}
              customer={customerMap.get(visit.customerId)}
              index={index}
              onDelete={onDeleteVisit}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
