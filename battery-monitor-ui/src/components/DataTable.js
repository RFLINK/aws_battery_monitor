// src/components/DataTable.js
import React from 'react';

export default function DataTable({ items }) {
  if (!items.length) {
    return <div>データがありません</div>;
  }

  // voltages のチャンクサイズ
  const CHUNK_SIZE = 20;

  // ヘッダを動的に作るため、最初のアイテムの voltages 長さから分数を計算
  const numChunks = Math.ceil((items[0].voltages?.length || 0) / CHUNK_SIZE);

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }} border="1" cellPadding="4">
      <thead>
        <tr>
          <th>Time (JST)</th>
          <th>rssi</th>
          <th>temperature</th>
          <th>humidity</th>
          {Array.from({ length: numChunks }).map((_, idx) => (
            <th key={idx}>{`${idx + 1} min 分電圧(20点)`}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          // ① sequence_number→日時変換
          const epochSecs = item.sequence_number * 180;
          const timeStr   = new Date(epochSecs * 1000)
                              .toLocaleString('ja-JP', { hour12: false });

          // ② voltages を 20要素ずつの配列群に分割
          const chunks = [];
          for (let i = 0; i < (item.voltages||[]).length; i += CHUNK_SIZE) {
            chunks.push(item.voltages.slice(i, i + CHUNK_SIZE));
          }

          return (
            <tr key={item.sequence_number}>
              <td>{timeStr}</td>
              <td>{item.rssi}</td>
              <td>{item.temperature}</td>
              <td>{item.humidity}</td>
              {/* ③ チャンクごとにセル出力 */}
              {chunks.map((grp, i) => (
                <td key={i}>
                  {grp.map(v => v.toFixed(2)).join(', ')}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
