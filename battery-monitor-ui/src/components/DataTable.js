import React, { useState, useMemo } from 'react';

// Cookie からソート方向を取得
const getSortCookie = () => {
  const match = document.cookie.match(/(?:^|;\s*)sort=([^;]+)/);
  return match ? match[1] : 'asc';
};

// Cookie にソート方向を保存
const setSortCookie = (value) => {
  document.cookie = `sort=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
};

export default function DataTable({ items }) {
  // 初期ソート方向
  const initialAsc = getSortCookie() === 'desc' ? false : true;
  const [sortAsc, setSortAsc] = useState(initialAsc);

  // 行データを生成（3分＝groupSize×1分ごとに分割）
  const rows = useMemo(() => {
    return items.flatMap(item => {
      const { gateway_id, sequence_number, rssi, temperature, voltages } = item;
      const baseEpochSec = sequence_number * 180;
      const groupSize = voltages.length / 20;
      return Array.from({ length: groupSize }).map((_, minuteOffset) => {
        const start = minuteOffset * 20;
        const voltChunk = voltages.slice(start, start + 20);
        const sum = voltChunk.reduce((a, b) => a + b, 0);
        const avgVoltage = sum / voltChunk.length;
        const timeMs = (baseEpochSec + minuteOffset * 60) * 1000;
        const time = new Date(timeMs).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        return {
          gateway_id,
          rssi,
          time,
          timeMs,
          temperature,
          avgVoltage,
          voltages: voltChunk,
          groupSize,
          groupIndex: minuteOffset
        };
      });
    });
  }, [items]);

  // ソート処理
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) =>
      sortAsc ? a.timeMs - b.timeMs : b.timeMs - a.timeMs
    );
  }, [rows, sortAsc]);

  // ヘッダークリック時にトグル＆Cookie 保存
  const onToggleSort = () => {
    const next = !sortAsc;
    setSortAsc(next);
    setSortCookie(next ? 'asc' : 'desc');
  };

  // スタイル定義
  const containerStyle = { width: '1230px', overflowX: 'auto', paddingRight: '30px' };
  const thStylePointer = {
    border: '1px solid #ccc', padding: '4px', background: '#f0f0f0',
    textAlign: 'center', cursor: 'pointer', userSelect: 'none'
  };
  const thStyle = {
    border: '1px solid #ccc', padding: '4px', background: '#f0f0f0',
    textAlign: 'center', userSelect: 'none'
  };
  const tdRight = { border: '1px solid #ccc', padding: '4px', textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <div>
      <div style={containerStyle}>
        <table style={{ width: '1230px', borderCollapse: 'collapse'}}>
          <colgroup>
            <col style={{ width: '150px' }} /> {/* Time */}
            <col style={{ width: '60px' }} />  {/* GW */}
            <col style={{ width: '60px' }} />  {/* RSSI */}
            <col style={{ width: '60px' }} />  {/* temp */}
            <col style={{ width: '60px' }} />  {/* avgV */}
            <col />                            {/* voltages */}
            </colgroup>
          <thead>
            <tr>
              <th style={thStylePointer} onClick={onToggleSort}>
                time (JST) {sortAsc ? '▲' : '▼'}
              </th>
              <th style={thStyle}>gw</th>
              <th style={thStyle}>rssi</th>
              <th style={thStyle}>temp.</th>
              <th style={thStyle}>avgV.</th>
              <th style={thStyle}>voltages (20点／分)</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              // グループ開始行か判定
              const isGroupStart = sortAsc
                ? row.groupIndex === 0
                : row.groupIndex === row.groupSize - 1;
              return (
                <tr key={idx}>
                  {/* 時刻 */}
                  <td style={tdRight}>{row.time}</td>

                  {/* gateway_id はグループ開始行にのみ rowSpan で表示 */}
                  {isGroupStart && (
                    <td style={tdRight} rowSpan={row.groupSize}>
                      {row.gateway_id}
                    </td>
                  )}

                  {/* gateway_id はグループ開始行にのみ rowSpan で表示 */}
                  {isGroupStart && (
                    <td style={tdRight} rowSpan={row.groupSize}>
                      {row.rssi}
                    </td>
                  )}

                  {/* 温度セルはグループ開始行にのみ rowSpan で表示 */}
                  {isGroupStart && (
                    <td style={tdRight} rowSpan={row.groupSize}>
                      {row.temperature}
                    </td>
                  )}

                  {/* 平均電圧 */}
                  <td style={tdRight}>{row.avgVoltage.toFixed(2)}</td>

                  {/* ボルテージグリッド */}
                  <td style={{ border: '1px solid #ccc', padding: '4px', overflowX: 'auto' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(20, 1fr)',
                      gap: '2px',
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap',
                      paddingRight: '16px'
                    }}>
                      {row.voltages.map((v, j) => (
                        <div key={j} style={{ textAlign: 'right' }}>
                          {v.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
