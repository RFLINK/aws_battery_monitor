// src/components/DateRangePicker.js
import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const CenteredInput = React.forwardRef(({ value, onClick, onChange, onKeyDown, disabled, placeholder }, ref) => (
  <input
    ref={ref}
    value={value}
    placeholder={placeholder}
    onClick={onClick}
    onChange={onChange}     // ← これを追加
    onKeyDown={onKeyDown}   // ← これを追加
    disabled={disabled}
    style={{
      width: 120,
      textAlign: 'center',
      cursor: disabled ? 'default' : 'pointer',
      backgroundColor: disabled ? '#f5f5f5' : 'white',  // 背景色を指定
      opacity: 1,                                        // opacity の上書き
      color: disabled ? '#555' : '#000',                 // 文字色の上書き
    }}
  />
));

const popperProps = {
  strategy: 'fixed',            // ← ここを追加
  modifiers: [
    { name: 'offset',          options: { offset: [0, 8] } },
    { name: 'preventOverflow', options: { boundary: 'viewport' } }
  ]
};

export default function DateRangePicker({
  start, end, onStartChange, onEndChange, disableEnd = false
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -2 }}>
      {/* 開始時刻にも customInput を指定 */}
      <DatePicker
        wrapperClassName="date-picker-wrapper"
        selected={start}
        onChange={onStartChange}
        showTimeSelect
        timeFormat="HH:mm"
        dateFormat="yyyy/MM/dd HH:mm"
        popperPlacement="bottom-start"
        popperProps={popperProps}
        customInput={<CenteredInput />}
      />

      <span style={{ position: 'relative', top: 2 }}>〜</span>
  
      {/* 終了時刻 */}
      <DatePicker
        wrapperClassName="date-picker-wrapper"
        selected={disableEnd ? null : end}
        onChange={onEndChange}
        showTimeSelect
        timeFormat="HH:mm"
        dateFormat="yyyy/MM/dd HH:mm"
        disabled={disableEnd}
        placeholderText={disableEnd ? 'now' : undefined}
        popperPlacement="bottom-start"
        popperProps={popperProps}
        customInput={<CenteredInput />}
      />
    </div>
  );
}
