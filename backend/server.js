require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.enc');

// encryption settings (use JWT_SECRET or fallback)
const SECRET = (process.env.JWT_SECRET || 'please-set-a-32-byte-secret-that-is-secure').slice(0,32);
const ALGO = 'aes-256-gcm';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function encryptAndSave(obj){
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(SECRET), iv);
  const plaintext = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  };
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(payload), {mode:0o600});
}

function readDecrypted(){
  if(!fs.existsSync(TOKENS_FILE)) return [];
  try{
    const payload = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const encrypted = Buffer.from(payload.data, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, Buffer.from(SECRET), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }catch(e){
    console.error('Failed to decrypt tokens file:', e.message);
    return [];
  }
}

if(!fs.existsSync(TOKENS_FILE)){
  encryptAndSave([]);
}

// Basic Auth middleware (optional). If ADMIN_USER and ADMIN_PASS are set, protect /api and /auth endpoints.
const ADMIN_USER = process.env.ADMIN_USER || null;
const ADMIN_PASS = process.env.ADMIN_PASS || null;
function requireBasicAuth(req, res, next){
  if(!ADMIN_USER || !ADMIN_PASS) return next();
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Basic ')){
    res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Authentication required.');
  }
  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  if(user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
  return res.status(401).send('Invalid credentials.');
}

// Apply auth middleware to admin endpoints
app.use(['/api','/auth','/export'], requireBasicAuth);

// Health
app.get('/health', (req, res) => res.json({ok:true, ts: Date.now()}));

// tokens endpoints (safe list)
app.get('/api/tokens', (req, res) => {
  const list = readDecrypted();
  const safe = list.map(entry => ({id: entry.id, account_name: entry.account_name, ig_user_id: entry.ig_user_id || null, created_at: entry.created_at}));
  res.json(safe);
});

app.post('/api/tokens', async (req, res) => {
  const {account_name, access_token, ig_user_id} = req.body || {};
  if(!account_name || !access_token) return res.status(400).json({error:'account_name and access_token are required'});
  const list = readDecrypted();
  const id = crypto.randomBytes(8).toString('hex');
  const entry = {id, account_name, access_token, ig_user_id: ig_user_id || null, created_at: new Date().toISOString()};
  list.push(entry);
  encryptAndSave(list);
  res.json({ok:true, id});
});

app.delete('/api/tokens/:id', (req, res) => {
  const id = req.params.id;
  let list = readDecrypted();
  const before = list.length;
  list = list.filter(e => e.id !== id);
  encryptAndSave(list);
  res.json({ok:true, removed: before - list.length});
});

// Exchange short-lived -> long-lived
app.post('/auth/exchange_token', async (req, res) => {
  const {access_token} = req.body || {};
  if(!access_token) return res.status(400).json({error:'access_token required'});
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if(!appId || !appSecret) return res.status(500).json({error:'META_APP_ID and META_APP_SECRET must be set in env to perform exchange'});
  try{
    const url = `https://graph.facebook.com/v16.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${access_token}`;
    const r = await axios.get(url);
    return res.json(r.data);
  }catch(e){
    console.error('token exchange error', e.response ? e.response.data : e.message);
    return res.status(500).json({error:'exchange_failed', details: e.response ? e.response.data : e.message});
  }
});

// Fetch insights for stored account
app.get('/api/insights/:id', async (req, res) => {
  const id = req.params.id;
  const list = readDecrypted();
  const entry = list.find(e=>e.id === id);
  if(!entry) return res.status(404).json({error:'not_found'});
  const token = entry.access_token;
  try{
    let igUserId = entry.ig_user_id;
    if(!igUserId){
      const pages = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${token}`);
      if(pages.data && pages.data.data && pages.data.data.length){
        for(const p of pages.data.data){
          if(p.id){
            try{
              const pageInfo = await axios.get(`https://graph.facebook.com/${p.id}?fields=instagram_business_account&access_token=${token}`);
              if(pageInfo.data && pageInfo.data.instagram_business_account && pageInfo.data.instagram_business_account.id){
                igUserId = pageInfo.data.instagram_business_account.id;
                break;
              }
            }catch(err){
            }
          }
        }
      }
      if(!igUserId){
        try{
          await axios.get(`https://graph.facebook.com/me?access_token=${token}`);
        }catch(e){}
      }
      if(igUserId){
        entry.ig_user_id = igUserId;
        const updated = list.map(e=> e.id===entry.id ? entry : e);
        encryptAndSave(updated);
      }
    }

    let media = [];
    if(igUserId){
      const mediaResp = await axios.get(`https://graph.facebook.com/${igUserId}/media?fields=id,caption,media_type,media_url,timestamp,like_count,comments_count&access_token=${token}&limit=50`);
      media = mediaResp.data.data || [];
      const mediaWithInsights = [];
      for(const m of media){
        let insights = {};
        try{
          const ins = await axios.get(`https://graph.facebook.com/${m.id}/insights?metric=impressions,reach,engagement,saved&access_token=${token}`);
          insights = ins.data.data || [];
        }catch(e){
          insights = {error:'insights_fetch_failed'};
        }
        mediaWithInsights.push({...m, insights});
      }
      media = mediaWithInsights;
    }

    let profileInsights = null;
    if(igUserId){
      try{
        const pi = await axios.get(`https://graph.facebook.com/${igUserId}/insights?metric=impressions,reach,profile_views,followers_count&period=day&access_token=${token}`);
        profileInsights = pi.data.data || null;
      }catch(e){
        profileInsights = {error:'profile_insights_failed'};
      }
    }

    return res.json({ok:true, account_name: entry.account_name, ig_user_id: entry.ig_user_id || null, media, profileInsights});
  }catch(e){
    console.error('insights error', e.response ? e.response.data : e.message);
    return res.status(500).json({error:'insights_failed', details: e.response ? e.response.data : e.message});
  }
});

// Export CSV or PDF for a stored account's media insights
app.get('/export/:id', async (req, res) => {
  const id = req.params.id;
  const format = (req.query.format || 'csv').toLowerCase();
  const list = readDecrypted();
  const entry = list.find(e=>e.id === id);
  if(!entry) return res.status(404).json({error:'not_found'});
  const token = entry.access_token;
  try{
    // resolve ig id if needed (reuse logic)
    let igUserId = entry.ig_user_id;
    if(!igUserId){
      try{
        const pages = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${token}`);
        if(pages.data && pages.data.data && pages.data.data.length){
          for(const p of pages.data.data){
            try{
              const pageInfo = await axios.get(`https://graph.facebook.com/${p.id}?fields=instagram_business_account&access_token=${token}`);
              if(pageInfo.data && pageInfo.data.instagram_business_account && pageInfo.data.instagram_business_account.id){
                igUserId = pageInfo.data.instagram_business_account.id;
                break;
              }
            }catch(e){}
          }
        }
      }catch(e){}
    }
    if(!igUserId) return res.status(400).json({error:'cannot_resolve_ig_user_id'});
    const mediaResp = await axios.get(`https://graph.facebook.com/${igUserId}/media?fields=id,caption,media_type,media_url,timestamp,like_count,comments_count&access_token=${token}&limit=200`);
    const media = mediaResp.data.data || [];
    // build rows
    const rows = media.map(m => {
      const impressions = (m.insights && Array.isArray(m.insights) && m.insights.find(x=>x.name==='impressions')) ? m.insights.find(x=>x.name==='impressions').values.map(v=>v.value).join('|') : '';
      return {
        id: m.id || '',
        caption: m.caption ? m.caption.replace(/\n/g,' ') : '',
        media_type: m.media_type || '',
        timestamp: m.timestamp || '',
        likes: m.like_count || 0,
        comments: m.comments_count || 0,
        impressions
      };
    });

    if(format === 'csv'){
      const header = ['id','caption','media_type','timestamp','likes','comments','impressions'];
      const lines = [header.join(',')];
      for(const r of rows){
        const esc = v => '"' + String(v).replace(/"/g,'""') + '"';
        lines.push([r.id, r.caption, r.media_type, r.timestamp, r.likes, r.comments, r.impressions].map(esc).join(','));
      }
      const csv = lines.join('\n');
      res.setHeader('Content-disposition', `attachment; filename="${entry.account_name.replace(/\s+/g,'_')}_media.csv"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.send(csv);
    }else{
      // PDF generation
      const doc = new PDFDocument({margin:30, size:'A4'});
      res.setHeader('Content-disposition', `attachment; filename="${entry.account_name.replace(/\s+/g,'_')}_media.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      doc.pipe(res);
      doc.fontSize(18).text(`Media Report - ${entry.account_name}`, {align:'center'});
      doc.moveDown();
      rows.forEach((r, idx) => {
        doc.fontSize(10).text(`${idx+1}. ID: ${r.id}`);
        doc.text(`   Caption: ${r.caption}`);
        doc.text(`   Type: ${r.media_type}  |  Timestamp: ${r.timestamp}`);
        doc.text(`   Likes: ${r.likes}  Comments: ${r.comments}  Impressions: ${r.impressions}`);
        doc.moveDown(0.5);
      });
      doc.end();
    }

  }catch(e){
    console.error('export error', e.response ? e.response.data : e.message);
    return res.status(500).json({error:'export_failed', details: e.response ? e.response.data : e.message});
  }
});

// legacy dashboard sample
// Trigger refresh: fetch insights for account id and save latest report to data/reports/<id>.json
app.get('/api/refresh/:id', async (req, res) => {
  const id = req.params.id;
  const list = readDecrypted();
  const entry = list.find(e=>e.id === id);
  if(!entry) return res.status(404).json({error:'not_found'});
  try{
    // reuse insights logic by calling internal endpoint
    const resp = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/insights/${id}`);
    const reportDir = path.join(DATA_DIR, 'reports');
    if(!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, `${id}.json`), JSON.stringify(resp.data, null, 2), {mode:0o600});
    return res.json({ok:true, message:'refreshed', saved_to:`data/reports/${id}.json`});
  }catch(e){
    console.error('refresh error', e.response ? e.response.data : e.message);
    return res.status(500).json({error:'refresh_failed', details: e.response ? e.response.data : e.message});
  }
});

app.get('/api/dashboard', (req, res) => {
  const sample = { followers: 12345, follower_change_7d: 120, impressions_7d: 45234, reach_7d: 37800, engagement_rate: 3.8, top_posts: [{id:'1', caption:'New product', likes:820, comments:54, impressions:12000, engagement:6.8, media_url:''}], audience: {top_countries:['US','EG','SA'], age_ranges:{'18-24':32,'25-34':45}} };
  res.json(sample);
});

// Serve built frontend (if exists)
const frontBuild = path.join(__dirname, '..', 'frontend', 'dist');
if(fs.existsSync(frontBuild)){
  app.use(express.static(frontBuild));
  app.get('/', (req,res) => res.sendFile(path.join(frontBuild,'index.html')));
  // for client-side routing, serve index.html for unmatched routes
  app.get('*', (req,res,next) => {
    if(req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/export')) return next();
    res.sendFile(path.join(frontBuild,'index.html'));
  });
}

app.listen(PORT, ()=> console.log('Server running on port', PORT));
