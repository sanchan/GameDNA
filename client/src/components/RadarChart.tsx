import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

interface RadarChartProps {
  data: { name: string; score: number }[];
  onGenreClick?: (genre: string) => void;
}

export default function RadarChart({ data, onGenreClick }: RadarChartProps) {
  const maxScore = Math.max(...data.map((d) => d.score), 1);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="name"
          tick={(props: any) => {
            const { x, y, payload } = props;
            return (
              <g
                onClick={() => onGenreClick?.(payload.value)}
                style={{ cursor: onGenreClick ? 'pointer' : 'default' }}
              >
                <text
                  x={x}
                  y={y}
                  fill={onGenreClick ? '#818cf8' : '#94a3b8'}
                  fontSize={12}
                  textAnchor={props.textAnchor}
                  dominantBaseline="central"
                >
                  {payload.value}
                </text>
              </g>
            );
          }}
        />
        <PolarRadiusAxis domain={[0, maxScore]} tick={false} axisLine={false} />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.3}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
