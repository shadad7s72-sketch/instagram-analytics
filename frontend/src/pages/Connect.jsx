import React, {useEffect, useState} from 'react';
import axios from 'axios';

export default function Connect(){
  const [url, setUrl] = useState('');
  useEffect(()=>{
    axios.get('http://localhost:3000/auth/url').then(r=>setUrl(r.data.url)).catch(()=>setUrl(''));
  },[]);
  return (
    <div>
      <h2>Connect Instagram</h2>
      <p>Click the button below to start the Meta OAuth flow (opens Meta login page):</p>
      {url ? <a href={url}><button>Connect with Facebook/Instagram</button></a> : <div>Loading...</div>}
      <hr />
      <h3>Notes</h3>
      <ol>
        <li>After approval, Meta will redirect to the backend callback endpoint.</li>
        <li>Follow README to exchange code for tokens and configure environment variables.</li>
      </ol>
    </div>
  );
}
