// src/components/DeviceSelector.js
import React, { useEffect, useState } from 'react';
import { API_BASE, LIST_DEVICES_PATH } from '../config';

export default function DeviceSelector({ value, onChange, authId, authPass }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    if (!authId || !authPass) return;

    const fetchDevices = async () => {
      try {
        const qs = new URLSearchParams({
          id: authId,
          password: authPass,
        });
        const res = await fetch(`${API_BASE}${LIST_DEVICES_PATH}?${qs}`, { mode: 'cors' });
        const json = await res.json();
        const items = Array.isArray(json) ? json : json.Items || [];
        setDevices(items);
      } catch (e) {
        console.error('[DeviceSelector] デバイス一覧の取得に失敗:', e);
        setDevices([]);
      }
    };

    fetchDevices();
  }, [authId, authPass]);

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        paddingTop: '2px',
        paddingLeft: '8px',
        paddingBottom: '2px',
        height: '26px',
        lineHeight: '1.2',
        boxSizing: 'border-box',
      }}
    >
      <option value="">デバイスを選択</option>
      {devices.map(d => (
        <option key={d.device_id || d} value={d.device_id || d}>
          {d.device_id || d}
        </option>
      ))}
    </select>
  );
}
