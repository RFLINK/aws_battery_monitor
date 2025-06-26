// src/components/DataTable.js
import React, { useState, useMemo, useEffect } from 'react';

// Cookie からソート方向を取得
const getSortCookie = () => {
  const match = document.cookie.match(/(?:^|;\s*)sort=([^;]+)/);
  return match ? match[1] : 'asc';
};

// Cookie にソート方向を保存
const setSortCookie = (value) => {
  document.cookie = `sort=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
};

export default function DataTable({ items, showAll = false }) {
  // ソート方向 state
  const initialAsc = getSortCookie() === 'desc' ? false : true;
  const [sortAsc, setSortAsc] = useState(initialAsc);

  // 全件表示制御 state
  const [internalShowAll, setInternalShowAll] = useState(showAll);
  useEffect(() => {
    if (showAll) setInternalShowAll(true);
  }, [showAll]);

  // 行データを生成
  const rows = useMemo(() => {
    return items.flatMap(item => {
      const { gateway_id, sequence_number, rssi, temperature, voltages } = item;
      const baseEpochSec = sequence_number * 180;
      const groupSize = voltages.length / 20;
      return Array.from({ length: groupSize }).map((_, minuteOffset) => {
        const idx = minuteOffset * 20;
        const chunk = voltages.slice(idx, idx + 20);
        const avgVoltage = chunk.reduce((sum, v) => sum + v, 0) / chunk.length;
        const timeMs = (baseEpochSec + minuteOffset * 60) * 1000;
        const time = new Date(timeMs).toLocaleString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        return { gateway_id, rssi, temperature, time, timeMs, avgVoltage, voltages: chunk, groupSize, groupIndex: minuteOffset };
      });
    });
  }, [items]);

  // ソート済み行
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => (sortAsc ? a.timeMs - b.timeMs : b.timeMs - a.timeMs));
  }, [rows, sortAsc]);

  // 昇順用/降順用の境界時刻
  const minTime = useMemo(() => (rows.length ? Math.min(...rows.map(r => r.timeMs)) : 0), [rows]);
  const maxTime = useMemo(() => (rows.length ? Math.max(...rows.map(r => r.timeMs)) : 0), [rows]);

  // 表示行の切り出し
  const visibleRows = useMemo(() => {
    if (internalShowAll) return sortedRows;
    if (!sortedRows.length) return [];
    const WINDOW_MS = 18 * 60 * 1000;
    if (sortAsc) {
      const cutoff = minTime + WINDOW_MS;
      return sortedRows.filter(r => r.timeMs >= minTime && r.timeMs < cutoff);
    } else {
      const cutoff = maxTime - WINDOW_MS;
      return sortedRows.filter(r => r.timeMs <= maxTime && r.timeMs > cutoff);
    }
  }, [sortedRows, internalShowAll, minTime, maxTime, sortAsc]);

  // ソート切り替え
  const onToggleSort = () => {
    const next = !sortAsc;
    setSortAsc(next);
    setSortCookie(next ? 'asc' : 'desc');
    setInternalShowAll(false);
  };

  // スタイル
  const containerStyle = { width: '1230px', overflowX: 'auto', paddingRight: '30px' };
  const thBase = { border: '1px solid #ccc', padding: '4px', background: '#f0f0f0', userSelect: 'none', textAlign: 'center' };
  const thSortable = { ...thBase, cursor: 'pointer' };
  const thNormal = { ...thBase, cursor: 'default' };
  const tdRight = { border: '1px solid #ccc', padding: '4px', textAlign: 'center', whiteSpace: 'nowrap' };

  return (
    <div>
      <div style={containerStyle}>
        <table style={{ width: '1230px', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '150px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '60px' }} />
          <col style={{ width: '60px' }} />
          <col />
        </colgroup>
        <thead>
          <tr>
              <th style={thSortable} onClick={onToggleSort}>
              time (JST) {sortAsc ? '▲' : '▼'}
            </th>
              <th style={thNormal}>gw</th>
              <th style={thNormal}>rssi</th>
              <th style={thNormal}>temp.</th>
              <th style={thNormal}>avgV.</th>
              <th style={thNormal}>voltages (20点／分)</th>
          </tr>
        </thead>
          <tbody>
            {visibleRows.map(row => {
              const isStart = sortAsc ? row.groupIndex === 0 : row.groupIndex === row.groupSize - 1;
              return (
                <tr key={`${row.timeMs}-${row.groupIndex}`} id={`row-${row.timeMs}`}>
                  <td style={tdRight}>{row.time}</td>
                  {isStart && <td style={tdRight} rowSpan={row.groupSize}>{row.gateway_id}</td>}
                  {isStart && <td style={tdRight} rowSpan={row.groupSize}>{row.rssi}</td>}
                  {isStart && <td style={tdRight} rowSpan={row.groupSize}>{row.temperature}</td>}
                  <td style={tdRight}>{row.avgVoltage.toFixed(2)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 1fr)', gap: '2px', fontSize: '0.9rem', whiteSpace: 'nowrap', paddingRight: '16px' }}>
                      {row.voltages.map((v, i) => <div key={i} style={{ textAlign: 'right' }}>{v.toFixed(2)}</div>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!internalShowAll && visibleRows.length < sortedRows.length && (
        <div style={{ textAlign: 'center', margin: '8px 0' }}>
          <button onClick={() => setInternalShowAll(true)}>全て表示</button>
        </div>
      )}
    </div>
  );
}
