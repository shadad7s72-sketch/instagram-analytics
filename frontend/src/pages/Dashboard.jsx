import React, {useEffect, useState} from 'react';
import axios from 'axios';

export default function Dashboard(){
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);

  useEffect(()=>{ loadAccounts(); },[]);

  const loadAccounts = async ()=>{
    try{
      const r = await axios.get('/api/tokens');
      setAccounts(r.data || []);
      if(r.data && r.data.length) selectAccount(r.data[0].id);
    }catch(e){ setAccounts([]); }
  };

  const selectAccount = async (id)=>{
    setSelected(id);
    setData(null);
    try{
      const r = await axios.get(`/api/insights/${id}`);
      setData(r.data);
    }catch(e){ setData({error:'failed'}); }
  };

  return (
    <div style={{display:'flex', gap:20}}>
      <aside style={{width:280, borderRight:'1px solid #eee', paddingRight:12}}>
        <h3>Accounts</h3>
        {accounts.length===0 && <div style={{color:'#777'}}>No stored accounts. Add one on the Manage page.</div>}
        <ul style={{listStyle:'none', padding:0}}>
          {accounts.map(a=>(
            <li key={a.id} style={{padding:'8px 0', cursor:'pointer', borderBottom:'1px solid #fafafa'}} onClick={()=>selectAccount(a.id)}>
              <strong>{a.account_name}</strong><br/><small style={{color:'#666'}}>IG: {a.ig_user_id || '-'}</small>
            </li>
          ))}
        </ul>
      </aside>
      <main style={{flex:1}}>
        {!selected && <div>Select an account to view insights.</div>}
        {data && data.ok && (
          <div>
            <h2>{data.account_name}</h2>
            <div style={{display:'flex', gap:12}}>
              <div style={{padding:12,border:'1px solid #ddd',borderRadius:8}}>
                <h4>Recent posts</h4>
                <div>{data.media ? data.media.length : 0}</div>
              </div>
              <div style={{padding:12,border:'1px solid #ddd',borderRadius:8}}>
                <h4>Profile Insights</h4>
                <div>{data.profileInsights ? data.profileInsights.length + ' metrics' : '—'}</div>
              </div>
            </div>

            <section style={{marginTop:18}}>
              <h3>Top posts</h3>
              <ul>
                {data.media && data.media.map(m => (
                  <li key={m.id} style={{padding:8,borderBottom:'1px solid #eee'}}>
                    <strong>{m.caption ? m.caption.substring(0,80) : '(no caption)'}</strong>
                    <div style={{fontSize:12,color:'#666'}}>{m.media_type} • {m.timestamp}</div>
                    <div style={{fontSize:13}}>Likes: {m.like_count || m.likes || 0} • Comments: {m.comments_count || 0}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {data && data.error && <div style={{color:'red'}}>Failed to load data.</div>}
      </main>
    </div>
  );
}
