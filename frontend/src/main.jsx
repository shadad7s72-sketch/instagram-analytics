import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import Manage from './pages/Manage';
import './styles.css';

function App(){
  return (
    <BrowserRouter>
      <div style={{padding:20,fontFamily:'Arial, sans-serif'}}>
        <header style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
          <h1>IG Analytics (Starter)</h1>
          <nav style={{marginLeft:'auto'}}>
            <Link to="/">Dashboard</Link> | <Link to="/connect">Connect</Link> | <Link to="/manage">Manage</Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard/>}/>
          <Route path="/connect" element={<Connect/>}/>
          <Route path="/manage" element={<Manage/>}/>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
