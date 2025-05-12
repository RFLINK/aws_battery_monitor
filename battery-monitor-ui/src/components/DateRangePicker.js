// src/components/DateRangePicker.js
import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Floating-UI 用の設定
const popperProps = {
  modifiers: [
    {
      name: 'offset',
      options: { offset: [0, 8] }       // 親要素からのオフセット
    },
    {
      name: 'preventOverflow',
      options: { boundary: 'viewport' }  // ビューポート内に収める
    }
  ]
};

export default function DateRangePicker({
  start, end, onStartChange, onEndChange
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: -2,   // ↑ 上に 8px 動かす
        marginLeft: 0,  // ← 右へ 16px 動かす
      }}
    >
      <DatePicker
        selected={start}
        onChange={onStartChange}
        showTimeSelect
        timeFormat="HH:mm"                  // 24時間制
        dateFormat="yyyy/MM/dd HH:mm"
        popperPlacement="bottom-start"
        popperProps={popperProps}
      />
      <span style={{ margin: '0 0px' }}>{'~'}</span>
      <DatePicker
        selected={end}
        onChange={onEndChange}
        showTimeSelect
        timeFormat="HH:mm"                  // 24時間制
        dateFormat="yyyy/MM/dd HH:mm"
        popperPlacement="bottom-start"
        popperProps={popperProps}
      />
    </div>
  );
}
