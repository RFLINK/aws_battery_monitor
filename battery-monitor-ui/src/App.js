// src/App.js
import React, { useState } from 'react';
import DeviceSelector from './components/DeviceSelector';
import DateRangePicker from './components/DateRangePicker';
import DataTable from './components/DataTable';
import { API_BASE, QUERY_DATA_PATH } from './config';

function App() {
  const [device, setDevice] = useState('');
  const [start, setStart]   = useState(new Date(Date.now() - 3600*1000));
  const [end,   setEnd]     = useState(new Date());
  const [data,  setData]    = useState([]);
  const [loading, setLoading] = useState(false);

  // デバッグ表示用
  const [debug, setDebug] = useState({
    startEpoch: null,
    endEpoch:   null,
    startSeq:   null,
    endSeq:     null,
  });

  const fetchData = async (format = 'json') => {
    if (!device) return;
    setLoading(true);
    
    const startEpoch = Math.floor(start.getTime() / 1000);
    const endEpoch   = Math.floor(end.getTime()   / 1000);
    const startSeq   = Math.floor(startEpoch / 180);
    const endSeq     = Math.floor(endEpoch   / 180);
    
    setDebug({ startEpoch, endEpoch, startSeq, endSeq });
    
    const qs = new URLSearchParams({
      device_id: device,
      start:     startSeq,
      end:       endSeq,
      format
    });
    
    const url = `${API_BASE}${QUERY_DATA_PATH}?${qs}`;
    try {
      if (format === 'csv') {
        window.open(url);
      } else {
        const res = await fetch(url, { mode: 'cors' });
        const json = await res.json();
        setData(json);
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Battery Monitor</h1>
      <div style={{ marginBottom: 16 }}>
        <DeviceSelector value={device} onChange={setDevice} />
        <DateRangePicker
          start={start} end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
        />
        <button onClick={() => fetchData('json')} disabled={!device||loading}>
          検索
        </button>
        <button onClick={() => fetchData('csv')} disabled={!device||loading}>
          CSVダウンロード
        </button>
      </div>

      {/*
        ここがデバッグ用表示の挿入箇所です。
        fetchData() 後に startSeq / endSeq が表示されるようになります。
      */}
      {debug.startSeq !== null && (
        <div style={{ marginBottom: 16, fontSize:12, color:'#666' }}>
         <div>Start Epoch: {debug.startEpoch} → Start Seq: {debug.startSeq}</div>
         <div>End   Epoch: {debug.endEpoch}   → End   Seq: {debug.endSeq}</div>
        </div>
      )}
      
      { loading
        ? <div>Loading…</div>
        : <DataTable items={data} />
      }
    </div>
  );
}

export default App;
