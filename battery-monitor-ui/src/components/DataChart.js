// src/components/DataChart.js
import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line
} from 'recharts';

export default function DataChart({ items }) {
  // items: Array of { sequence_number, rssi, temperature, humidity, voltages }
  // 各 item の voltages を 20 点ずつに分割して、1行ごとの平均電圧を含むチャートデータを生成
  const chartData = items.flatMap(item => {
    const { sequence_number, temperature, voltages } = item;
    const baseEpochSec = sequence_number * 180;
    const dataPoints = [];
    for (let i = 0; i < voltages.length; i += 20) {
      const chunk = voltages.slice(i, i + 20);
      const minuteOffset = i / 20;
      const dt = new Date((baseEpochSec + minuteOffset * 60) * 1000);
      const timeLabel = dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const avgVoltage = chunk.reduce((sum, v) => sum + v, 0) / chunk.length;
      dataPoints.push({
        time: timeLabel,
        temperature,
        avgVoltage
      });
    }
    return dataPoints;
  });

  return (
    <div style={{ width: '99%', height: 300, marginBottom: 16 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="top" height={36} />
          <Line type="monotone" dataKey="temperature" stroke="#82ca9d" dot={false} />
          <Line type="monotone" dataKey="avgVoltage" stroke="#ffc658" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
