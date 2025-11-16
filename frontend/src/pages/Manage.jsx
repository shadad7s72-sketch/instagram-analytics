import React, {useEffect, useState} from 'react';
import axios from 'axios';

export default function Manage(){
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({});

  const load = async ()=>{
    try{
      const r = await axios.get('/api/tokens');
      setTokens(r.data || []);
    }catch(e){
      setTokens([]);
    }
  };
  useEffect(()=>{ load(); },[]);

  const add = async ()=>{
    if(!name || !token) return alert('Enter name and token');
    setLoading(true);
    try{
      await axios.post('/api/tokens', {account_name:name, access_token: token});
      setName(''); setToken(''); load();
    }catch(e){
      alert('Failed to add token. Ensure backend credentials or Basic Auth set in browser.');
    }finally{ setLoading(false); }
  };

  const remove = async (id)=>{
    if(!confirm('Delete this stored token?')) return;
    try{
      await axios.delete('/api/tokens/'+id);
      load();
    }catch(e){ alert('Delete failed'); }
  };

  const exchange = async ()=>{
    if(!token) return alert('Enter short-lived token to exchange');
    try{
      const r = await axios.post('/auth/exchange_token',{access_token: token});
      alert('Exchange result:\n' + JSON.stringify(r.data, null, 2) + '\n\nIf successful, add the returned access_token via Add button.');
    }catch(e){ alert('Exchange failed: ' + (e.response ? JSON.stringify(e.response.data) : e.message)); }
  };

  const exportReport = (id, fmt='csv')=>{
    window.open(`/export/${id}?format=${fmt}`, '_blank');
  };

  const refresh = async (id)=>{
    setStatusMap(prev=>({...prev, [id]:'refreshing'}));
    try{
      const r = await axios.get(`/api/refresh/${id}`);
      setStatusMap(prev=>({...prev, [id]:'done'}));
      alert('Refresh OK — report saved: ' + (r.data.saved_to || 'unknown'));
    }catch(e){
      setStatusMap(prev=>({...prev, [id]:'failed'}));
      alert('Refresh failed: ' + (e.response ? JSON.stringify(e.response.data) : e.message));
    }
  };

  return (
    <div style={{maxWidth:1100, margin:'0 auto', padding:20, fontFamily:'Inter, Arial, sans-serif'}}>
      <h2 style={{fontSize:22, marginBottom:8}}>Manage Accounts & Tokens</h2>
      <p style={{color:'#666'}}>Add your Instagram access token once. The system will convert it (if short-lived), save it encrypted, and fetch insights automatically.</p>

      <div style={{display:'grid', gridTemplateColumns:'360px 1fr', gap:20, alignItems:'start'}}>
        <div style={{padding:16, border:'1px solid #eee', borderRadius:8, background:'#fff'}}>
          <label style={{fontSize:13, color:'#333'}}>Account name</label><br/>
          <input value={name} onChange={e=>setName(e.target.value)} style={{width:'100%', padding:8, marginTop:6, marginBottom:10}} placeholder="e.g. My Brand"/>

          <label style={{fontSize:13, color:'#333'}}>Access token</label><br/>
          <textarea value={token} onChange={e=>setToken(e.target.value)} style={{width:'100%', padding:8, marginTop:6, height:100}} placeholder="Paste your token here"/>

          <div style={{display:'flex', gap:8, marginTop:10}}>
            <button onClick={add} disabled={loading}>Save token</button>
            <button onClick={exchange} style={{background:'#f3f3f3'}}>Convert token</button>
          </div>
        </div>

        <div style={{padding:16, border:'1px solid #eee', borderRadius:8, background:'#fff'}}>
          <h3 style={{marginTop:0}}>Stored Accounts</h3>
          <div style={{maxHeight:420, overflowY:'auto'}}>
            {tokens.length===0 && <div style={{color:'#777'}}>No accounts yet — add one from the left panel.</div>}
            {tokens.map(t=> (
              <div key={t.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f2f2f2'}}>
                <div>
                  <div style={{fontWeight:600}}>{t.account_name}</div>
                  <div style={{fontSize:12, color:'#666'}}>IG ID: {t.ig_user_id || '-'}</div>
                  <div style={{fontSize:11, color:'#999'}}>Added: {new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <button onClick={()=>exportReport(t.id,'csv')}>CSV</button>
                  <button onClick={()=>exportReport(t.id,'pdf')}>PDF</button>
                  <button onClick={()=>refresh(t.id)} disabled={statusMap[t.id]==='refreshing'}>{statusMap[t.id]==='refreshing' ? 'Refreshing...' : 'Refresh'}</button>
                  <button onClick={()=>remove(t.id)} style={{background:'#ffecec'}}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
