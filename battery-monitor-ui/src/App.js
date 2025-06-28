import React, { useState, useEffect } from 'react';
import { Search, FileText, Trash2, Settings, Loader, Pin, PinOff, LogIn, LogOut } from 'lucide-react';
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

const getPinnedCookie = () => {
  const m = document.cookie.match(/(?:^|;\s*)pinnedGraph=([^;]+)/);
  return m ? m[1] === 'true' : false;
};
const setPinnedCookie = (val) => {
  document.cookie = `pinnedGraph=${val}; path=/; max-age=${60*60*24*365}`;
};

const getAuthCookie = (key) => {
  const m = document.cookie.match(`(?:^|;\\s*)${key}=([^;]*)`);
  return m ? decodeURIComponent(m[1]) : '';
};

const setAuthCookie = (key, val, days = 365) => {
  const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  document.cookie = `${key}=${encodeURIComponent(val)}; path=/; expires=${expires}`;
};

const deleteAuthCookie = (key) => {
  document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export default function App() {
  const [device, setDevice] = useState('');
  const [start, setStart]   = useState(new Date(Date.now() - 3600*24*3*1000));
  const [end,   setEnd]     = useState(new Date());
  const [data,  setData]    = useState([]);
  const [manualEnd, setManualEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(() => getShowTableCookie());
  const [showAllRows, setShowAllRows]   = useState(false);
  const [pinnedGraph, setPinnedGraph] = useState(() => getPinnedCookie());

  // ID/PASS
  const [authId, setAuthId] = useState(() => getAuthCookie('authId'));
  const [authPass, setAuthPass] = useState(() => getAuthCookie('authPass'));
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!(getAuthCookie('authId') && getAuthCookie('authPass'));
  });
  
  // 削除モーダル用ステート
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput]         = useState('');

  // 結果モーダル用ステート
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultCount, setResultCount]         = useState(0);

  console.log('🔧 Settings:', Settings);

  // デバイス選択時に自動検索
  useEffect(() => {
    if (!device) return;
    if (!manualEnd) {
      const now = new Date();
      setEnd(now);  // 自動で現在時刻に更新
      // start はそのまま維持
    }
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
  useEffect(() => {
    setPinnedCookie(pinnedGraph);
  }, [pinnedGraph]);
  
  //設定ボタンモーダル
  const [showSettings, setShowSettings] = useState(false);
  const [settingsData, setSettingsData] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const loadSettings = async () => {
    if (!device) return;
    setLoadingSettings(true);
    try {
      // sequence=0 のレコードのみ取得するなら start=0, end=0 を渡す
      const qs = new URLSearchParams({
        device_id: device,
        start:       '0',
        end:         '0',
        format:      'json',
        id:          authId,
        password:    authPass
      });
      const res = await fetch(`${API_BASE}${QUERY_DATA_PATH}?${qs}`);
      const json = await res.json();
      const items = Array.isArray(json)
        ? json
        : (Array.isArray(json.Items) ? json.Items : []);
      const record = items[0] || null;
      setSettingsData(record);
    } catch (e) {
      console.error(e);
      setSettingsData({ error: '取得失敗' });
    } finally {
      setLoadingSettings(false);
    }
  };

  const onSettingsClick = () => {
    loadSettings();
    setShowSettings(true);
  };

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
    const qs = new URLSearchParams({
      device_id: device,
      start: startSeq,
      end: endSeq,
      format
    });

    if (isAuthenticated) {
      qs.set('id', authId);
      qs.set('password', authPass);
    } else {
      alert("ログインしてください");
      setLoading(false);
      return;
    }
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

  const onLogin = async () => {
    if (!authId || !authPass) {
      alert('IDとパスワードを入力してください');
      return;
    }

    try {
      const res = await fetch(`https://ko81621j3g.execute-api.ap-northeast-1.amazonaws.com/Login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: authId, password: authPass }),
        credentials: 'include' // ← Set-Cookie を受け取るのに必要
      });

      if (!res.ok) {
        alert('ログイン失敗');
        return;
      }
      
      // Cookie への保存を追加
      setAuthCookie('authId', authId);
      setAuthCookie('authPass', authPass);

      const result = await res.json();
      console.log('ログイン成功:', result);
      setIsAuthenticated(true);

      setManualEnd(false);  // ← 自動モードにしておく
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      setStart(threeHoursAgo);
      setEnd(now);

      setShowTable(true);
          
    } catch (err) {
      console.error('ログインエラー', err);
      alert('ログイン処理中にエラーが発生しました');
    }
  };

  const onLogout = () => {
    // Cookie 削除
    deleteAuthCookie('authId');
    deleteAuthCookie('authPass');
    deleteAuthCookie('auth_token');

    // ログイン状態 false に
    setIsAuthenticated(false);
    setAuthId('');
    setAuthPass('');

    // 表示データを初期化
    setDevice('');
    setData([]);
    setShowAllRows(false);
    setShowTable(false);
    setSettingsData(null);
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

  // ─── 追加：チャートクリック時に呼ばれるハンドラ ───
  const handleChartClick = (datum, idx) => {
    console.log('clicked datum, idx:', datum, idx);
    setShowTable(true);
    setShowAllRows(true);   // ← 全件表示をONに
    setTimeout(() => {
      // DataTable の <tr id> は row-<timeMs>、datum.timestamp と同じ値なのでこちらを使います
      const key = datum.timestamp;
      const row = document.getElementById(`row-${key}`);
      console.log('scroll to id=', `row-${key}`, 'found?', !!row);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  };
  
  return (
    <div style={{ padding: '20px 20px 0 20px' }}>
      <h1 style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
        <img src={batteryIcon} alt="Battery Icon" style={{ width: 32, height: 32, marginRight: 8 }} />
        Battery Monitor
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!isAuthenticated ? (
            <>
              <input
                type="text"
                placeholder="ID"
                value={authId}
                onChange={e => setAuthId(e.target.value)}
                style={{ height: 14, fontSize: 12 }}
              />
              <input
                type="password"
                placeholder="PASS"
                value={authPass}
                onChange={e => setAuthPass(e.target.value)}
                style={{ height: 14, fontSize: 12 }}
              />
              <button
                onClick={onLogin}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: 24,
                  fontSize: 12,
                  padding: '0 12px',
                  fontFamily: 'Meiryo',
                  border: '1px solid #4caf50',
                  borderRadius: '4px',
                  backgroundColor: '#e8f5e9',
                  cursor: 'pointer',
                  color: '#2e7d32'
                }}
              >
                <LogIn size={12} />
              </button>
            </>
          ) : (
            <span style={{
              fontSize: 12,
              color: 'green',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'Meiryo'
            }}>
              🔓 {authId}
              <button
                onClick={onLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  height: 24,
                  fontSize: 12,
                  padding: '0 12px',
                  fontFamily: 'Meiryo',
                  border: '1px solid #4caf50',
                  borderRadius: '4px',
                  backgroundColor: '#e8f5e9',
                  cursor: 'pointer',
                  color: '#c62828',
                }}
              >
                <LogOut size={12} />
              </button>
            </span>
          )}
        </div>
      </h1>

      {isAuthenticated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '20px 0 20px 20px' }}>
        
          <DeviceSelector value={device} onChange={setDevice} authId={authId} authPass={authPass} />

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
            title="検索"
          >
            <Search size={20} />
          </button>
          <button
            className="toolbar-button"
            onClick={() => fetchData('csv')}
            disabled={!device||loading}
            title="CSV"
          >
            <FileText size={20} />
          </button>
          <button
           className="toolbar-button btn-delete"
           disabled={!device||loading}
           onClick={() => setShowDeleteModal(true)}
           title="削除"
          >
            <Trash2 size={20} />
          </button>
          <button
            className="toolbar-button"
            disabled={!device||loading}
            onClick={onSettingsClick}
            title="設定"
          >
            <Settings size={20} />
          </button>
          

          {/* ─── 追加：ピンアイコンでレイアウト切替 ─── */}
          <button
            className="toolbar-button"
            onClick={() => setPinnedGraph(prev => !prev)}
            title={
              pinnedGraph
                ? 'アンピンして通常レイアウトに戻す'
                : 'ピンしてテーブルをスクロール'
            }
          >
            {pinnedGraph ? <Pin size={20} /> : <PinOff size={20} />}
          </button>
          
          {showSettings && (
            <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <span className="modal-close" onClick={() => setShowSettings(false)}>✕</span>
                <h3>デバイス {device} の sequence=0 情報</h3>
                {loadingSettings ? (
                  <div className="loading-overlay"><Loader size={48} className="spinner" /></div>
                ) : settingsData ? (
                 <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                   {/* ① db_update_time を JST に変換して表示 */}
                   {settingsData.db_update_time !== undefined && (
                     <p>
                       更新時刻 (JST):{' '}
                       {new Date(settingsData.db_update_time * 1000)
                         .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                     </p>
                   )}
                   {/* ② その他のフィールドも見やすく */}
                   {Object.entries(settingsData).map(([key, val]) => (
                     <p key={key}>
                       <strong>{key}:</strong>{' '}
                       {JSON.stringify(val)}
                     </p>
                   ))}
                 </div>
                ) : (
                  <p>データがありません</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
              <button onClick={() => {
                setShowResultModal(false);
                window.location.reload();
              }}>OK</button>
            </div>
          </div>
        </div>
      )} 
           
      {/* ここでテーブルを表示するかのスイッチを追加 */}
      {loading ? (
        <div className="loading-overlay">
          <Loader size={48} className="spinner" />
        </div>
      ) : (
        <div className={pinnedGraph ? 'layout--separate' : 'layout--normal'}>
          <div className="graph">
            <DataChart items={data} onPointClick={handleChartClick}/>
          </div>
          {showTable && (
            <div className="table">
              <DataTable items={data} showAll={showAllRows} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
