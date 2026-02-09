import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OffsetLag } from '@/types/monitoring.types';

interface Props {
  offsetLags: OffsetLag[];
}

function getLagColor(lag: number): string {
  if (lag === 0) return 'text-green-600';
  if (lag <= 10) return 'text-yellow-600';
  return 'text-red-600';
}

export function OffsetLagTable({ offsetLags }: Props) {
  // Group by topic
  const topicGroups = offsetLags.reduce((acc, offset) => {
    if (!acc[offset.topic]) {
      acc[offset.topic] = [];
    }
    acc[offset.topic].push(offset);
    return acc;
  }, {} as Record<string, OffsetLag[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kafka Offset Lag</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topic</TableHead>
              <TableHead className="text-center">Partition</TableHead>
              <TableHead className="text-right">Latest</TableHead>
              <TableHead className="text-right">Committed</TableHead>
              <TableHead className="text-right">Lag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(topicGroups).map(([topic, offsets]) => (
              <>
                {offsets.map((offset, idx) => (
                  <TableRow key={`${topic}-${offset.partition}`}>
                    {idx === 0 && (
                      <TableCell
                        rowSpan={offsets.length}
                        className="font-medium align-top"
                      >
                        {topic}
                      </TableCell>
                    )}
                    <TableCell className="text-center">{offset.partition}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(offset.latestOffset).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(offset.committedOffset).toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${getLagColor(offset.lag)}`}>
                      {offset.lag.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row for this topic */}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="text-right font-medium">
                    Total for {topic}:
                  </TableCell>
                  <TableCell
                    className={`text-right font-bold ${getLagColor(
                      offsets.reduce((sum, o) => sum + o.lag, 0)
                    )}`}
                  >
                    {offsets.reduce((sum, o) => sum + o.lag, 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              </>
            ))}
            {offsetLags.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No offset lag data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
