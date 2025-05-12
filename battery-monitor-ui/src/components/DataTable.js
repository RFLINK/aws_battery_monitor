// src/components/DataTable.js
import React from 'react';

export default function DataTable({ items }) {

  // 1) items の各要素を、20 点ずつ分割→フラットな行配列に変換
  const rows = items.flatMap(item => {
    const { sequence_number, rssi, temperature, humidity, voltages } = item;
    // sequence_number は「epoch秒 / 180」なので、逆算して epoch秒 を求める
    const baseEpochSec = sequence_number * 180;
    const chunks = [];
    for (let i = 0; i < voltages.length; i += 20) {
      const voltChunk = voltages.slice(i, i + 20);

      // 分割インデックスから「何分後か」を計算
      const minuteOffset = i / 20; // 0,1,2,...
      const dt = new Date((baseEpochSec + minuteOffset * 60) * 1000);
      const timeStr = dt.toLocaleString('ja-JP', {
        year:   'numeric',
        month:  '2-digit',
        day:    '2-digit',
        hour:   '2-digit',
        minute: '2-digit'
      });
      
      // avgVoltage を計算
      const sum = voltChunk.reduce((acc, v) => acc + v, 0);
      const avgVoltage = sum / voltChunk.length;

      chunks.push({
        time:        timeStr,
        temperature,
        avgVoltage,
        voltages:    voltChunk,
      });
    }
    return chunks;
  });

  // テーブルを包むコンテナ（横幅固定＆横スクロール対応）
  const containerStyle = {
    width:       '1080px',
    margin:      '0 ',
    overflowX:   'auto'
  };

  // th / td の共通スタイル
  const thStyle = {
    border:      '1px solid #ccc',
    padding:     '4px',
    background:  '#f0f0f0',
    textAlign:   'center',
    fontSize:    '0.9rem',
    whiteSpace:  'nowrap'
  };
  const tdLeft = {
    border:      '1px solid #ccc',
    padding:     '4px',
    fontSize:    '0.9rem',
    whiteSpace:  'nowrap'
  };
  const tdRight = {
    border:      '1px solid #ccc',
    padding:     '4px',
    textAlign:   'center',
    fontSize:    '0.9rem',
    whiteSpace:  'nowrap'
  };

  return (
    <div style={containerStyle}>
      <table style={{ width: '1080px', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: '150px' }} />{/* Time */}
          <col style={{ width:  '70px' }} />{/* temperature */}
          <col style={{ width:  '70px' }} />{/* avgVoltage */}
          <col />{/* voltages: 残り幅 */}
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>Time (JST)</th>
            <th style={thStyle}>temp.</th>
            <th style={thStyle}>avgVol.</th>
            <th style={thStyle}>voltages (20点／分)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td style={tdRight}>{row.time}</td>
              <td style={tdRight}>{row.temperature}</td>
              <td style={tdRight}>{row.avgVoltage.toFixed(2)}</td>
              <td style={{ border:'1px solid #ccc', padding:'4px', overflowX:'auto' }}>
                <div style={{
                  display:           'grid',
                  gridTemplateColumns:'repeat(20, 1fr)',
                  gridAutoColumns:   'minmax(40px, 1fr)',
                  gap:               '2px',
                  fontSize:          '0.9rem',
                  whiteSpace:        'nowrap',
                  paddingRight:      '16px'
                }}>
                  {row.voltages.map((v, j) => (
                    <div key={j} style={{ textAlign:'right' }}>
                      {v.toFixed(2)}
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
