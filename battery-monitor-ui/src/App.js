// src/App.js
import React, { useState, useEffect } from 'react';
import DeviceSelector from './components/DeviceSelector';
import DateRangePicker from './components/DateRangePicker';
import './App.css';
import DataTable from './components/DataTable';
import DataChart from './components/DataChart';
import batteryIcon from './icon_darkshape.png'
import {
  API_BASE,
  QUERY_DATA_PATH,
  DELETE_DATA_PATH    // ← 追加
} from './config';

function App() {
  const [device, setDevice] = useState('');
  const [start, setStart]   = useState(new Date(Date.now() - 3600*24*7*1000));
  const [end,   setEnd]     = useState(new Date());
  const [data,  setData]    = useState([]);
  const [loading, setLoading] = useState(false);

  // デバイスを選んだら自動で「今−1h～今」をセット
  useEffect(() => {
    if (!device) return;
    const now = new Date();
    setEnd(now);
    setStart(new Date(now.getTime() - 3600 * 24 * 7 * 1000));
    fetchData('json');
  }, [device]);

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

  // ------------------------
  // 追加：データ削除ハンドラ
  // ------------------------
  const deleteData = async () => {
    if (!device) return;
    if (!window.confirm('本当に表示中のデータを削除しますか？')) return;

    // start/end を UNIX s → sequence_number に変換
    const startSeq = Math.floor(Math.floor(start.getTime()/1000) / 180);
    const endSeq   = Math.floor(Math.floor(end  .getTime()/1000) / 180);

    const qs = new URLSearchParams({
      device_id: device,
      start:     startSeq,
      end:       endSeq
    });

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}${DELETE_DATA_PATH}?${qs}`,
        { method: 'DELETE', mode: 'cors' }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const { deleted } = await res.json();
      alert(`削除完了: ${deleted} 件のレコードを削除しました。`);
      // 削除後は再検索
      fetchData('json');
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
        {/* アイコン画像 */}
        <img
          src={batteryIcon}
          alt="Battery Icon"
          style={{
            width: 32,      // お好みのサイズに
            height: 32,
            marginRight: 8, // テキストとの隙間
          }}
        />
        Battery Monitor
      </h1>
      <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: 20, marginBottom: 20, marginLeft: 20}}>
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
        <button
          onClick={deleteData}
          disabled={!device||loading}
          style={{ marginLeft: 8, backgroundColor: '#e74c3c', color: '#fff' }}
        >
          削除
        </button>
      </div>
      {/*
        ここがデバッグ用表示の挿入箇所です。
        fetchData() 後に startSeq / endSeq が表示されるようになります。
      {debug.startSeq !== null && (
        <div style={{ marginBottom: 16, fontSize:12, color:'#666' }}>
         <div>Start Epoch: {debug.startEpoch} → Start Seq: {debug.startSeq}</div>
         <div>End   Epoch: {debug.endEpoch}   → End   Seq: {debug.endSeq}</div>
        </div>
      )}
      */}
            
      { loading
        ?   <div>Loading…</div>
        : (
            <>
              <DataChart items={data} />
              <DataTable items={data} />
            </>
          )
      }
    </div>
  );
}

export default App;
