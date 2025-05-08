// src/components/DeviceSelector.js
import React, { useEffect, useState } from 'react';
import { API_BASE, LIST_DEVICES_PATH } from '../config';

export default function DeviceSelector({ value, onChange }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}${LIST_DEVICES_PATH}`, { mode: 'cors' })
      .then(r => r.json())
      .then(setDevices)
      .catch(console.error);
  }, []);

  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">-- デバイスを選択 --</option>
      {devices.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  );
}
