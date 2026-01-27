import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { Progress } from '@/types';

interface ResultsPieChartProps {
  progress: Progress;
  className?: string;
}

const COLORS = {
  pass: 'hsl(142, 76%, 36%)',
  fail: 'hsl(0, 84%, 60%)',
  block: 'hsl(38, 92%, 50%)',
  query: 'hsl(199, 89%, 48%)',
  pending: 'hsl(215, 16%, 47%)',
};

export function ResultsPieChart({ progress, className }: ResultsPieChartProps) {
  const pending = progress.total - progress.pass - progress.fail - progress.block - progress.query;

  const data = [
    { name: 'Pass', value: progress.pass, color: COLORS.pass },
    { name: 'Fail', value: progress.fail, color: COLORS.fail },
    { name: 'Blocked', value: progress.block, color: COLORS.block },
    { name: 'Query', value: progress.query, color: COLORS.query },
    { name: 'Pending', value: pending > 0 ? pending : 0, color: COLORS.pending },
  ].filter(item => item.value > 0);

  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No test results yet
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [value, 'Tests']}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
