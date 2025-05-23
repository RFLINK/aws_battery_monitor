import React, { useState, useEffect } from 'react';
import DeviceSelector from './components/DeviceSelector';
import DateRangePicker from './components/DateRangePicker';
import './App.css';
import DataTable from './components/DataTable';
import DataChart from './components/DataChart';
import batteryIcon from './icon_darkshape.png';
import { API_BASE, QUERY_DATA_PATH, DELETE_DATA_PATH } from './config';

const getShowTableCookie = () => {
  const m = document.cookie.match(/(?:^|;\s*)showTable=([^;]+)/);
  return m ? m[1] === 'true' : true;
};

// クッキーに showTable 状態を保存（1 年間有効）
const setShowTableCookie = (val) => {
  document.cookie = `showTable=${val}; path=/; max-age=${60*60*24*365}`;
};

export default function App() {
  const [device, setDevice] = useState('');
  const [start, setStart]   = useState(new Date(Date.now() - 3600*24*3*1000));
  const [end,   setEnd]     = useState(new Date());
  const [data,  setData]    = useState([]);
  const [manualEnd, setManualEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(() => getShowTableCookie());

  // 削除モーダル用ステート
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput]         = useState('');

  // 結果モーダル用ステート
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultCount, setResultCount]         = useState(0);

  // デバイス選択時に自動検索
  useEffect(() => {
    if (!device) return;
    const now = new Date();
    setEnd(now);
    setStart(new Date(now.getTime() - 3600 * 24 * 3 * 1000));
    fetchData('json');
  }, [device]);

  // モーダルの Enter/Escape 対応
  useEffect(() => {
    const handler = (e) => {
      if (showDeleteModal) {
        if (e.key === 'Enter') onConfirmDelete();
        if (e.key === 'Escape') handleCancel();
      }
      if (showResultModal && e.key === 'Escape') {
        setShowResultModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDeleteModal, showResultModal, deleteInput]);

  useEffect(() => {
    setShowTableCookie(showTable);
  }, [showTable]);

  // データ取得
  const fetchData = async (format = 'json') => {
    if (!device) return;
    setLoading(true);

    // 終了時刻を決定（autoEnd=trueならNow、それ以外はユーザー指定のend）
    const now     = new Date();
    const endTime = manualEnd ? end : now;
    if (!manualEnd) {
      // 自動モード時は常に end に now をセットしておく
      setEnd(now);
    }

    const startSeq = Math.floor(start.getTime() / 1000 / 180);
    const endSeq   = Math.floor(endTime.getTime()   / 1000 / 180) - 1;
    const qs = new URLSearchParams({ device_id: device, start: startSeq, end: endSeq, format });
    try {
      const url = `${API_BASE}${QUERY_DATA_PATH}?${qs}`;
      if (format === 'csv') window.open(url);
      else {
        const res = await fetch(url, { mode: 'cors' });
        const json = await res.json();
        const items = Array.isArray(json) ? json : (json.Items || []);
        setData(items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 範囲削除
  const deleteRangeData = async () => {
    setLoading(true);
    const startSeq = Math.floor(start.getTime() / 1000 / 180);
    const endSeq   = Math.floor(end.getTime()   / 1000 / 180) - 1;
    const qs = new URLSearchParams({ device_id: device, start: startSeq, end: endSeq });
    try {
      const res = await fetch(`${API_BASE}${DELETE_DATA_PATH}?${qs}`, { method: 'DELETE', mode: 'cors' });
      if (!res.ok) throw new Error(await res.text());
      const { deleted } = await res.json();
      return deleted;
    } finally {
      setLoading(false);
    }
  };

  // 全件削除
  const deleteAllData = async () => {
    setLoading(true);
    const qs = new URLSearchParams({ device_id: device, all: 'true' });
    try {
      const res = await fetch(`${API_BASE}${DELETE_DATA_PATH}?${qs}`, { method: 'DELETE', mode: 'cors' });
      if (!res.ok) throw new Error(await res.text());
      const { deleted } = await res.json();
      return deleted;
    } finally {
      setLoading(false);
    }
  };

  // 実行キャンセル
  const handleCancel = () => {
    setShowDeleteModal(false);
    setDeleteInput('');
  };

  // 確定ボタン
  const onConfirmDelete = async () => {
    try {
      let deletedCount;
      if (deleteInput === '『 削 除 』') deletedCount = await deleteRangeData();
      else if (deleteInput === '『 全 て 削 除 』') deletedCount = await deleteAllData();
      else return handleCancel();

      // モーダルを閉じる
      setShowDeleteModal(false);
      setDeleteInput('');
      // 結果モーダルを開く
      setResultCount(deletedCount);
      setShowResultModal(true);
    } catch (err) {
      setShowDeleteModal(false);
      setDeleteInput('');
      setResultCount(0);
      setShowResultModal(true);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
        <img src={batteryIcon} alt="Battery Icon" style={{ width: 32, height: 32, marginRight: 8 }} />
        Battery Monitor
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '20px 0 20px 20px' }}>
      
        <DeviceSelector value={device} onChange={setDevice} />

        {/* DatePicker コンポーネント側に「disableEnd」を反転して渡す */}
        <DateRangePicker
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          disableEnd={!manualEnd}
        />
        {/* チェックONで手動入力ONに（OFFだと自動で now に合わせる） */}
        <label style={{ marginLeft: 0, marginTop: -2, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={manualEnd}
            onChange={e => setManualEnd(e.target.checked)}
          />
        </label>
        
        <button
          className="toolbar-button"
          onClick={() => fetchData('json')}
          disabled={!device||loading}
        >
          検索
        </button>
        <button
          className="toolbar-button"
          onClick={() => fetchData('csv')}
          disabled={!device||loading}
        >
          CSV
       </button>
       <button
         className="toolbar-button btn-delete"
         disabled={!device||loading}
         onClick={() => setShowDeleteModal(true)}
       >
         削除
       </button>
       {/* 続きを表示ボタンを入れたので、これは不要に・・。
       <button 
          className="toolbar-button" 
          onClick={() => setShowTable(v => !v)}>
         {showTable ? 'テーブル表示' : 'テーブル非表示'}
       </button>
       */}       
     </div>

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Input words.</h2>
            {/*
            <p>
              範囲削除 →「削除」<br/>
              全件削除 →「全て削除」</p>
            */}
            <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} />
            <div className="modal-actions">
              <button onClick={onConfirmDelete}>OK</button>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 結果表示モーダル */}
      {showResultModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>削除完了</h2>
            <p>{resultCount} 件削除。</p>
            <div className="modal-actions">
              <button onClick={() => setShowResultModal(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

     {/* ここでテーブルを表示するかのスイッチを追加 */}
      {loading
        ? <div>Loading…</div>
        : <><DataChart items={data} />{ showTable && <DataTable items={data} /> }</>
      }
    </div>
  );
}
