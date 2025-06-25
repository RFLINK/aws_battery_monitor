// src/components/DataChart.js
import React, { useState } from 'react';
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

const getShowTempCookie = () => {
  const m = document.cookie.match(/(?:^|;\s*)showTemp=([^;]+)/);
  return m ? m[1] === 'true' : true;
};
const setShowTempCookie = (val) => {
  document.cookie = `showTemp=${val}; path=/; max-age=${60*60*24*365}`;
};

const getShowVoltageCookie = () => {
  const m = document.cookie.match(/(?:^|;\s*)showVoltage=([^;]+)/);
  return m ? m[1] === 'true' : true;
};
const setShowVoltageCookie = (val) => {
  document.cookie = `showVoltage=${val}; path=/; max-age=${60*60*24*365}`;
};

export default function DataChart({ items, onPointClick }) {
  // ① トグル用 state
  const [showTemp, setShowTemp]       = useState(getShowTempCookie());
  const [showVoltage, setShowVoltage] = useState(getShowVoltageCookie());

  // ─── クリック時に Recharts が渡す props からデータ点を取得 ───
  const handleChartClick = chartProps => {
    // (オプション) 中身確認用
    // console.log('[DataChart] chartProps:', chartProps);

    // activePayload[0].payload に、該当ポイントの {timestamp, temperature, avgVoltage} が入っている
    const payload = chartProps.activePayload?.[0]?.payload;
    // activeTooltipIndex にそのポイントの配列インデックスが入っている
    const idx = chartProps.activeTooltipIndex;

    if (payload && typeof idx === 'number') {
      onPointClick(payload, idx);
    }
  };

  // ② 元の chartData 作成ロジックはそのまま
  const chartData = items.flatMap(item => {
    const { sequence_number, temperature, voltages } = item;
    const baseSec = sequence_number * 180;
    return voltages.reduce((acc, _, idx) => {
      if (idx % 20 !== 0) return acc;
      const chunk = voltages.slice(idx, idx + 20);
      const avgVoltage = chunk.reduce((s,v) => s+v, 0) / chunk.length;
      const ts = (baseSec + (idx/20)*60)*1000;
      acc.push({ timestamp: ts, temperature, avgVoltage });
      return acc;
    }, []);
  });

  // ③ 空データガード＆軸まわりはそのまま
  const times = chartData.map(d => d.timestamp);
  if (times.length === 0) return null;
  const minTs = Math.min(...times), maxTs = Math.max(...times);
  const isWithin24h = (maxTs - minTs) <= 24 * 60 * 60 * 1000;
  const midnightTicks = [];
  const d = new Date(minTs); d.setHours(0,0,0,0);
  if (d.getTime() < minTs) d.setDate(d.getDate()+1);
  while (d.getTime() <= maxTs) {
    midnightTicks.push(d.getTime());
    d.setDate(d.getDate()+1);
  }

  const legendPayload = [
    {
      dataKey: 'temperature',
      value: 'temperature',
      type: 'line',
      color: '#82ca9d',
      inactive: !showTemp,      // state に応じたフラグ
    },
    {
      dataKey: 'avgVoltage',
      value: 'avgVoltage',
      type: 'line',
      color: '#ff0000',
      inactive: !showVoltage,
    }
  ];

  return (
    <div 
      style={{ width: '99%', height: 350, marginBottom: 8 }}
    >
      {/* ④ チェックボックス */}
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{ top: 0, right: 16, left: -20, bottom: 8 }}
          onClick={handleChartClick}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={[minTs, maxTs]}
            // ② 同一日なら時刻表示、跨いでたら日付表示
            ticks={!isWithin24h ? midnightTicks : undefined}
            tickFormatter={ms => {
              if (isWithin24h) {
                // 範囲が24時間以内 → 時刻だけ表示
                return new Date(ms).toLocaleTimeString('ja-JP', {
                  hour: '2-digit', minute: '2-digit'
                });
              } else {
                // 24時間超 → 日付表示
                return new Date(ms).toLocaleDateString('ja-JP', {
                  year: '2-digit', month: '2-digit', day: '2-digit'
                });
              }
            }}
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            domain={ (!showTemp || !showVoltage) ? ['dataMin', 'dataMax'] : undefined }
            tickFormatter={value => Number(value.toFixed(2))}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={ms => new Date(ms).toLocaleString('ja-JP', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })}
            formatter={value =>
              typeof value === 'number' ? Number(value.toFixed(2)) : value
            }
          />
          <Legend
            verticalAlign="top"
            align="center"        // 水平センター
            height={32}
            wrapperStyle={{ 
              cursor: 'pointer',
              margin: '0px 0px 0px 28px'  // 上:px、右:0、下:0、左:px
            }}
            payload={legendPayload}
            formatter={(value, entry) => (
              // inactive フラグで半透明に
              <span style={{ opacity: entry.inactive ? 0.5 : 1 }}>
                {value}
              </span>
            )}
            onClick={(entry) => {
              if (entry.dataKey === 'temperature') {
                setShowTemp(prev => {
                  const next = !prev;
                  setShowTempCookie(next);
                  return next;
                });
              } else if (entry.dataKey === 'avgVoltage') {
                setShowVoltage(prev => {
                  const next = !prev;
                  setShowVoltageCookie(next);
                  return next;
                });
              }
            }}
          />
          {/* ⑤ 条件付きレンダリング */}
          {showTemp && (
            <Line
              type="monotone"
              dataKey="temperature"
              name="temperature"
              stroke="#82ca9d"
              dot={false}
            />
          )}
          {showVoltage && (
            <Line
              type="monotone"
              dataKey="avgVoltage"
              name="avgVoltage"
              stroke="#ff0000"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
