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
  // �e item �� voltages �� 20 �_���ɕ������āA1�s���Ƃ̕��ϓd�����܂ރ`���[�g�f�[�^�𐶐�
  const chartData = items.flatMap(item => {
    const { sequence_number, temperature, humidity, voltages } = item;
    const baseEpochSec = sequence_number * 180;
    const dataPoints = [];
    for (let i = 0; i < voltages.length; i += 20) {
      const chunk = voltages.slice(i, i + 20);
      const minuteOffset = i / 20;
      const timestamp = (baseEpochSec + minuteOffset * 60) * 1000;
      const dt = new Date(timestamp);
      // X ���ɂ����\������Z�����x��
      const timeLabel = dt.toLocaleTimeString('ja-JP', {
        hour:   '2-digit',
        minute: '2-digit'
      });
      const avgVoltage = chunk.reduce((sum, v) => sum + v, 0) / chunk.length;
      dataPoints.push({
        timestamp,         // �� ���̃~���b
        timeLabel,         // �� XAxis �p�̕����񃉃x��
        temperature,
        humidity,
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
		  <XAxis
		    dataKey="timestamp"
		    type="number"
		    domain={['dataMin', 'dataMax']}
		    tickFormatter={ms => {
		      const d = new Date(ms);
		      return d.toLocaleDateString('ja-JP', {
		      year:  '2-digit',   // 2���̔N
		      month: '2-digit',   // 2���̌�
		      day:   '2-digit'    // 2���̓�
              });
		    }}
		  />
          <YAxis />
		  {chartData.length > 0 && (
          <Tooltip
		    labelKey="timestamp"
		    labelFormatter={ms => {
		      const d = new Date(ms);
		      return d.toLocaleString('ja-JP', {
		        year:   'numeric',
		        month:  '2-digit',
		        day:    '2-digit',
		        hour:   '2-digit',
		        minute: '2-digit'
		      });
            }}
          />)}
          <Legend verticalAlign="top" height={36} />
          <Line type="monotone" dataKey="temperature" stroke="#82ca9d" dot={false} />
          <Line type="monotone" dataKey="humidity" stroke="#88AAFF" dot={false} />
          <Line type="monotone" dataKey="avgVoltage" stroke="#F5190E" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
