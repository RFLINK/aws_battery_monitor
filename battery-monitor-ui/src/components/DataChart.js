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

/**
 * DataChart
 * - items �� 20�_���ɕ������ĕ��ϓd�����Z�o�Atimestamp ascending �̐V�f�[�^�𐶐����ĕ`��
 * - humidity �͏��O���Atemperature �� avgVoltage �̂ݕ\��
 * - �c�[���`�b�v���̐��l�͏����_�ȉ�3���Ɋۂ�
 */
export default function DataChart({ items }) {
  // items: Array<{sequence_number, temperature, humidity, voltages: number[]}> ���`���[�g�p�ɕϊ�
  const chartData = items.flatMap(item => {
    const { sequence_number, temperature, voltages } = item;
    const baseSec = sequence_number * 180;
    return voltages.reduce((acc, _, idx) => {
      if (idx % 20 !== 0) return acc;
      const chunk = voltages.slice(idx, idx + 20);
      const avgVoltage = chunk.reduce((sum, v) => sum + v, 0) / chunk.length;
      const ts = (baseSec + (idx / 20) * 60) * 1000;
      acc.push({
        timestamp: ts,
        temperature,
        avgVoltage
      });
      return acc;
    }, []);
  });

  return (
    <div style={{ width: '99%', height: 300, marginBottom: 16 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={ms => new Date(ms).toLocaleDateString('ja-JP', {
              year: '2-digit', month: '2-digit', day: '2-digit'
            })}
          />
          <YAxis />
          <Tooltip
            labelFormatter={ms => new Date(ms).toLocaleString('ja-JP', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })}
            formatter={(value) =>
              typeof value === 'number' ? Number(value.toFixed(2)) : value
            }
          />
          <Legend verticalAlign="top" height={24} />

          <Line
            type="monotone"
            dataKey="temperature"
            name="temperature"
            stroke="#82ca9d"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="avgVoltage"
            name="avgVoltage"
            stroke="#ff0000"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
