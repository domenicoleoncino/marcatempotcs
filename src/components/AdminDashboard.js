// File: src/components/AdminDashboard.js
/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { db, storage } from '../firebase'; 
import {
    collection, getDocs, query, where,
    Timestamp, onSnapshot, updateDoc, doc, limit,
    addDoc, writeBatch, deleteDoc, arrayUnion, orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal'; 
import MappaPresenze from './MappaPresenze'; 
import { utils, writeFile } from 'xlsx-js-style'; 
import { saveAs } from 'file-saver';
import { Modal, Table, Tag, Button, Tooltip } from 'antd'; 
import { InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// ===========================================
// --- STILE MAGICO "MUTAFORMA" (PC + MOBILE) ---
// ===========================================
const ModernStyles = () => (
    <style>
    {`
      .modern-bg { background-color: #f4f7fe; min-height: 100vh; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; overflow-x: hidden; }
      
      /* Header Layout Desktop */
      .modern-header { display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 15px 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); border-bottom: 1px solid #e2e8f0; }
      .header-left { flex: 1; display: flex; align-items: center; justify-content: flex-start; }
      .header-center { flex: 1; display: flex; justify-content: center; align-items: center; padding: 10px 0; }
      .header-right { flex: 1; display: flex; justify-content: flex-end; align-items: center; gap: 20px; }
      
      /* Navigation Desktop */
      .modern-nav { background: #ffffff; padding: 10px 20px 0 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); display: flex; justify-content: center; flex-wrap: wrap; margin-bottom: 30px; border-radius: 0 0 16px 16px; }
      .modern-tab { border: none; background: transparent; padding: 14px 24px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.3s; margin: 0 4px; font-size: 14px; border-bottom: 3px solid transparent; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
      .modern-tab:hover { color: #3b82f6; background: #f8fafc; border-radius: 8px 8px 0 0; }
      .modern-tab.active { color: #2563eb; border-bottom: 3px solid #2563eb; background: #eff6ff; border-radius: 8px 8px 0 0; }
      
      /* Cards & Titles Desktop */
      .modern-card { background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.04); padding: 28px; margin-bottom: 24px; border: 1px solid #e2e8f0; animation: fadeIn 0.4s ease-out; }
      .modern-title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; flex-wrap: wrap; }
      .title-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      
      /* Inputs Desktop */
      .modern-input { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; transition: 0.2s; font-size: 14px; background: #f8fafc; box-sizing: border-box; }
      .modern-input:focus { border-color: #3b82f6; background: #ffffff; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
      
      /* Tables Desktop */
      .modern-table-wrapper { overflow-x: auto; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 20px; }
      .modern-table { width: 100%; border-collapse: collapse; text-align: left; background: #fff; min-width: 600px; }
      .modern-table th { background: #f8fafc; padding: 16px 20px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
      .modern-table td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 14px; vertical-align: middle; transition: background 0.2s; }
      .modern-table tr:hover td { background: #f8fafc; }
      
      /* Buttons Desktop */
      .modern-btn { background: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; box-shadow: 0 2px 4px rgba(37,99,235,0.1); white-space: nowrap; }
      .modern-btn:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
      .modern-btn-danger { background: #ef4444; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
      .modern-btn-danger:hover:not(:disabled) { background: #dc2626; box-shadow: 0 4px 12px rgba(239,68,68,0.25); }
      .modern-btn-outline { background: white; color: #475569; border: 1px solid #cbd5e1; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
      .modern-btn-outline:hover:not(:disabled) { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
      
      /* Badges Desktop */
      .modern-badge { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; }
      .modern-badge.green { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
      .modern-badge.red { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
      .modern-badge.orange { background: #fef3c7; color: #92400e; border-color: #fde68a; }
      .modern-badge.blue { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
      .modern-badge.purple { background: #f3e8ff; color: #4338ca; border-color: #e9d5ff; }
      .modern-avatar { width: 36px; height: 36px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
      
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

      /* ========================================= */
      /* ADATTAMENTO SMARTPHONE E TABLET PICCOLI   */
      /* ========================================= */
      @media (max-width: 768px) {
          .modern-bg { padding: 0 !important; }
          
          /* Header Mobile */
          .modern-header { flex-direction: column; padding: 15px; gap: 15px; }
          .header-left, .header-center, .header-right { width: 100%; display: flex; justify-content: center; text-align: center; }
          .header-right { flex-direction: column; gap: 10px; }
          
          /* Nav Mobile */
          .modern-nav { padding: 10px; flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; -webkit-overflow-scrolling: touch; border-radius: 0; margin-bottom: 15px; }
          .modern-tab { flex: 0 0 auto; white-space: nowrap; font-size: 13px; padding: 10px 15px; }
          
          .modern-card { padding: 15px; margin: 10px; border-radius: 12px; }
          .modern-title { flex-direction: column; align-items: flex-start; font-size: 18px; }
          .title-actions { width: 100%; flex-direction: column; }
          .title-actions button { width: 100%; }
          
          /* Dashboard Stats Mobile */
          .dashboard-stats { display: flex !important; flex-direction: column !important; gap: 10px !important; margin-bottom: 15px !important; }
          .stat-card { padding: 15px !important; }
          .stat-label { font-size: 11px !important; }
          .stat-value { font-size: 24px !important; }
          
          /* Tables to Cards Mobile */
          .modern-table-wrapper { border: none; overflow-x: visible; }
          .modern-table { min-width: 100%; background: transparent; display: block; }
          .modern-table thead { display: none; }
          .modern-table tbody { display: block; width: 100%; }
          .modern-table tr { 
              display: flex; flex-direction: column; 
              margin-bottom: 15px; padding: 15px; 
              background: #fff; border: 1px solid #e2e8f0; 
              border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); 
          }
          .modern-table td { 
              display: flex; justify-content: space-between; align-items: center; 
              padding: 10px 0; border-bottom: 1px dashed #e2e8f0; 
              text-align: right; width: 100%; box-sizing: border-box; 
          }
          .modern-table td:last-child { border-bottom: none; padding-bottom: 0; }
          
          .modern-table td::before { 
              content: attr(data-label); 
              font-weight: 700; color: #64748b; 
              text-transform: uppercase; font-size: 11px; 
              margin-right: 15px; text-align: left; flex-shrink: 0;
          }
          
          .actions-cell { flex-direction: column; gap: 8px; align-items: stretch; }
          .actions-cell button { width: 100%; margin: 0; }
          
          .filters-grid { display: flex; flex-direction: column; gap: 10px; }
          .filters-grid > div, .filters-grid > button { width: 100%; }
      }
    `}
    </style>
);

// ===========================================
// --- 1. NOTIFICHE E VARIABILI GLOBALI ---
// ===========================================

const SUPER_ADMIN_EMAIL = "domenico.leoncino@tcsitalia.com"; 
const MAX_DEVICE_LIMIT = 2; 

const AREA_COLORS = ["FFCCCC", "CCFFCC", "CCCCFF", "FFFFCC", "FFCCFF", "CCFFFF", "FFD9CC", "E5CCFF", "D9FFCC", "FFE5CC"];

const NotificationPopup = ({ message, type, onClose }) => {
    const overlayStyle = { position: 'fixed', top: '20px', right: '20px', left: window.innerWidth <= 768 ? '20px' : 'auto', zIndex: 999999, minWidth: '300px', maxWidth: '450px', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)', borderLeft: `6px solid ${type === 'error' ? '#EF4444' : type === 'success' ? '#10B981' : '#3B82F6'}`, display: 'flex', alignItems: 'flex-start', padding: '16px', fontFamily: 'sans-serif', animation: 'slideInRight 0.4s ease-out' };
    return (
        <div style={overlayStyle}>
            <div style={{ fontSize: '24px', marginRight: '12px' }}>{type === 'success' ? '✅' : type === 'error' ? '⛔' : 'ℹ️'}</div>
            <div style={{ flex: 1 }}><h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: '#1F2937' }}>{type === 'success' ? 'Successo' : 'Attenzione'}</h4><p style={{ margin: 0, fontSize: '14px', color: '#4B5563' }}>{message}</p></div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>
    );
};

// ===========================================
// --- 2. SOTTO-COMPONENTI MODALI ---
// ===========================================

const AddExpenseModal = ({ show, onClose, user, userData, showNotification, expenseToEdit }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [note, setNote] = useState('');
    const [file, setFile] = useState(null); 
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (expenseToEdit) {
            setAmount(expenseToEdit.amount); setDescription(expenseToEdit.description);
            if (expenseToEdit.date && expenseToEdit.date.toDate) { setDate(expenseToEdit.date.toDate().toISOString().split('T')[0]); } else if (expenseToEdit.date) { setDate(new Date(expenseToEdit.date).toISOString().split('T')[0]); }
            setNote(expenseToEdit.note || ''); setFile(null); 
        } else {
            setAmount(''); setDescription(''); setNote(''); setFile(null); setDate(new Date().toISOString().split('T')[0]);
        }
    }, [expenseToEdit, show]);

    if (!show) return null;
    const handleSave = async (e) => {
        e.preventDefault(); if (!amount || !description || !date) return; setIsSaving(true);
        try {
            let receiptUrl = expenseToEdit ? expenseToEdit.receiptUrl : null;
            if (file) {
                const fileRef = ref(storage, `expenses/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(fileRef, file); receiptUrl = await getDownloadURL(snapshot.ref);
            }
            const expenseData = { amount: parseFloat(amount), description, note, date: Timestamp.fromDate(new Date(date)), userId: expenseToEdit ? expenseToEdit.userId : user.uid, userName: expenseToEdit ? expenseToEdit.userName : (userData?.name ? `${userData.name} ${userData.surname}` : user.email), userRole: expenseToEdit ? expenseToEdit.userRole : (userData?.role || 'unknown'), receiptUrl, status: expenseToEdit ? expenseToEdit.status : 'pending', updatedAt: Timestamp.now() };
            if (expenseToEdit) { await updateDoc(doc(db, "expenses", expenseToEdit.id), expenseData); showNotification("Spesa aggiornata con successo!", "success"); } else { expenseData.createdAt = Timestamp.now(); await addDoc(collection(db, "expenses"), expenseData); showNotification("Spesa registrata con successo!", "success"); }
            onClose();
        } catch (error) { showNotification("Errore: " + error.message, "error"); } finally { setIsSaving(false); }
    };
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', boxSizing: 'border-box' };
    return ReactDOM.createPortal(
        <><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={onClose} /><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}><div style={{backgroundColor:'#fff',width:'100%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto', margin: '0 15px'}} onClick={(e) => e.stopPropagation()}><div style={{padding:'16px 24px',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#ecfdf5'}}><h3 style={{margin:0,fontSize:'18px',fontWeight:'bold',color:'#047857'}}>{expenseToEdit ? '✏️ Modifica Spesa' : '💰 Registra Nuova Spesa'}</h3><button onClick={onClose} style={{border:'none',background:'none',fontSize:'24px',cursor:'pointer',color:'#047857'}}>&times;</button></div><div style={{padding:'24px'}}><form id="add-expense-form" onSubmit={handleSave}><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} required /></div><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Importo (€)</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} required /></div><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Descrizione</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} required /></div><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Allegato</label><input type="file" onChange={e => setFile(e.target.files[0])} accept="image/*,.pdf" style={inputStyle} /></div><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Note</label><textarea value={note} onChange={e => setNote(e.target.value)} style={inputStyle} /></div></form></div><div style={{padding:'16px 24px',backgroundColor:'#f8fafc',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'10px'}}><button type="button" onClick={onClose} className="modern-btn-outline">Annulla</button><button type="submit" form="add-expense-form" disabled={isSaving} className="modern-btn" style={{background:'#16a34a'}}>{isSaving ? '...' : 'Conferma'}</button></div></div></div></>, document.body
    );
};

const ProcessExpenseModal = ({ show, onClose, expense, bulkExpenses, isBulk, onConfirm, isProcessing }) => {
    const [adminPaymentMethod, setAdminPaymentMethod] = useState('Rimborso in Busta Paga');
    const [adminNote, setAdminNote] = useState('');
    
    if (!show || (!expense && !isBulk)) return null;

    const totalAmount = isBulk 
        ? bulkExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) 
        : parseFloat(expense?.amount || 0);

    const employeeName = isBulk 
        ? [...new Set(bulkExpenses.map(e => e.userName))].join(', ') 
        : expense?.userName;

    const handleSubmit = (e) => { e.preventDefault(); onConfirm(adminPaymentMethod, adminNote); };
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', boxSizing: 'border-box' };
    
    return ReactDOM.createPortal( <><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={onClose} /><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}><div style={{backgroundColor:'#fff',width:'100%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto', margin: '0 15px'}} onClick={(e) => e.stopPropagation()}><div style={{padding:'16px 24px',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f0fdf4'}}><h3 style={{margin:0,fontSize:'18px',fontWeight:'bold',color:'#166534'}}>{isBulk ? '✅ Salda Tutte le Spese Visibili' : '✅ Chiudi Spesa'}</h3><button onClick={onClose} style={{border:'none',background:'none',fontSize:'24px',cursor:'pointer',color:'#166534'}}>&times;</button></div><div style={{padding:'24px'}}><div style={{marginBottom:'20px', background:'#f8fafc', padding:'15px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
        <p>Stai per saldare <b>{isBulk ? 'TUTTE le spese in elenco' : 'la singola spesa'}</b>.</p>
        <p><strong>Dipendente:</strong> {employeeName}</p>
        <p><strong>Importo Totale:</strong> <span style={{color: '#cf1322', fontWeight: 'bold'}}>€ {totalAmount.toFixed(2)}</span></p></div><form id="process-expense-form" onSubmit={handleSubmit}><select value={adminPaymentMethod} onChange={e => setAdminPaymentMethod(e.target.value)} style={inputStyle}><option>Rimborso in Busta Paga</option><option>Bonifico Effettuato</option><option>Rimborso Cassa</option><option>Saldato da Dashboard</option></select><textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} style={inputStyle} placeholder="Es: Bonifico nr. 1234..." required /></form></div><div style={{padding:'16px 24px',backgroundColor:'#f8fafc',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'10px'}}><button onClick={onClose} className="modern-btn-outline">Annulla</button><button type="submit" form="process-expense-form" disabled={isProcessing || !adminNote.trim()} className="modern-btn" style={{background:'#16a34a'}}>{isProcessing ? 'Attendere...' : 'Conferma Saldo'}</button></div></div></div></>, document.body );
};

const EditTimeEntryModal = ({ entry, workAreas, onClose, onSave, isLoading }) => {
    const formatDateForInput = (dateStr) => { if (!dateStr) return ''; const parts = dateStr.split('/'); if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; return dateStr; };
    const [skipPause, setSkipPause] = useState(!!entry.skippedBreak);
    
    const isOngoing = !entry.clockOutTimeFormatted || entry.clockOutTimeFormatted === 'In corso' || entry.clockOutTimeFormatted.includes('-');
    
    const [formData, setFormData] = useState({ 
        workAreaId: entry.workAreaId || '', 
        note: entry.note || '', 
        date: formatDateForInput(entry.clockInDate), 
        clockInTime: entry.clockInTimeFormatted || '08:00', 
        clockOutTime: isOngoing ? '' : entry.clockOutTimeFormatted 
    });

    const handleChange = (e) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };
    
    const handleSubmit = (e) => { 
        e.preventDefault(); 
        if (skipPause && (!formData.note || formData.note.trim() === '')) { 
            alert("Nota obbligatoria se salti la pausa."); 
            return; 
        } 
        onSave(entry.id, { ...formData, skippedBreak: skipPause }); 
    };

    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', boxSizing: 'border-box' };
    return ReactDOM.createPortal( <><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={onClose}/><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}><div style={{backgroundColor:'#fff',width:'100%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto', margin: '0 15px'}} onClick={e=>e.stopPropagation()}><div style={{padding:'20px'}}><h3 style={{margin:0, marginBottom:'20px', fontSize:'18px', fontWeight:'bold', color:'#0f172a'}}>✏️ Modifica Timbratura</h3><form onSubmit={handleSubmit}><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Data</label><input type="date" name="date" value={formData.date} onChange={handleChange} style={inputStyle}/></div>{!entry.isAbsence && <div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Area/Cantiere</label><select name="workAreaId" value={formData.workAreaId} onChange={handleChange} style={inputStyle}>{workAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>}<div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Ora Ingresso</label><input type="time" name="clockInTime" value={formData.clockInTime} onChange={handleChange} style={inputStyle}/></div>{!entry.isAbsence && <div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Ora Uscita (Lascia vuoto se ancora a lavoro)</label><input type="time" name="clockOutTime" value={formData.clockOutTime} onChange={handleChange} style={inputStyle}/></div>}<div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'15px'}}><input type="checkbox" checked={skipPause} onChange={e=>setSkipPause(e.target.checked)} style={{width:'18px', height:'18px'}}/><label style={{fontWeight:'bold', color:'#0f172a'}}>Rimuovi Pausa (Nessuna pausa effettuata)</label></div><div><label style={{display:'block', fontSize:'12px', fontWeight:'bold', color:'#64748b', marginBottom:'5px'}}>Note</label><textarea name="note" value={formData.note} onChange={handleChange} style={inputStyle}/></div><div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}><button type="button" onClick={onClose} className="modern-btn-outline">Annulla</button><button type="submit" disabled={isLoading} className="modern-btn">Salva Modifiche</button></div></form></div></div></div></>, document.body );
};

const AddEmployeeToAreaModal = ({ show, onClose, allEmployees, workAreas, userData, showNotification, onDataUpdate }) => {
    const [selectedEmpId, setSelectedEmpId] = useState(''); const [selectedAreaId, setSelectedAreaId] = useState(''); const [isSaving, setIsSaving] = useState(false);
    const myAreas = useMemo(() => { if (!userData || !userData.managedAreaIds) return []; return workAreas.filter(a => userData.managedAreaIds.includes(a.id)); }, [workAreas, userData]);
    const sortedEmployees = useMemo(() => { return [...allEmployees].filter(e => !e.isDeleted).sort((a, b) => { const nameA = `${a.surname} ${a.name}`.toLowerCase(); const nameB = `${b.surname} ${b.name}`.toLowerCase(); return nameA.localeCompare(nameB); }); }, [allEmployees]);
    if (!show) return null;
    const handleSave = async (e) => { e.preventDefault(); if (!selectedEmpId || !selectedAreaId) return; setIsSaving(true); try { const employeeRef = doc(db, "employees", selectedEmpId); await updateDoc(employeeRef, { workAreaIds: arrayUnion(selectedAreaId) }); showNotification("Dipendente aggiunto!", "success"); await onDataUpdate(); onClose(); setSelectedEmpId(''); setSelectedAreaId(''); } catch (error) { showNotification("Errore", "error"); } finally { setIsSaving(false); } };
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', boxSizing: 'border-box' };
    return ReactDOM.createPortal( <><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={onClose}/><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}><div style={{backgroundColor:'#fff',width:'100%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto', margin: '0 15px'}}><div style={{padding:'20px'}}><h3 style={{margin:0, marginBottom:'20px', fontSize:'18px', fontWeight:'bold', color:'#0f172a'}}>👥 Aggiungi alla Squadra</h3><form onSubmit={handleSave}><select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} style={inputStyle}><option value="">-- Seleziona Dipendente --</option>{sortedEmployees.map(emp => (<option key={emp.id} value={emp.id}>{emp.surname} {emp.name}</option>))}</select><select value={selectedAreaId} onChange={e => setSelectedAreaId(e.target.value)} style={inputStyle}><option value="">-- Seleziona Area --</option>{myAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select><div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}><button type="button" onClick={onClose} className="modern-btn-outline">Annulla</button><button type="submit" disabled={isSaving} className="modern-btn">Conferma</button></div></form></div></div></div></>, document.body );
};

const AddFormModal = ({ show, onClose, workAreas, user, onDataUpdate, currentUserRole, userData, showNotification }) => {
    const [formTitle, setFormTitle] = useState(''); const [formUrl, setFormUrl] = useState(''); const [formAreaId, setFormAreaId] = useState(''); const [isSaving, setIsSaving] = useState(false);
    const availableAreas = useMemo(() => { if (currentUserRole === 'admin') return workAreas; if (currentUserRole === 'preposto' && userData?.managedAreaIds) return workAreas.filter(a => userData.managedAreaIds.includes(a.id)); return []; }, [currentUserRole, userData, workAreas]);
    if (!show) return null;
    const handleSave = async (e) => { e.preventDefault(); if (!formTitle || !formUrl || !formAreaId) return; setIsSaving(true); try { await addDoc(collection(db, "area_forms"), { title: formTitle, url: formUrl, workAreaId: formAreaId, createdBy: user.email, createdAt: Timestamp.now() }); showNotification("Modulo creato!", "success"); onDataUpdate(); onClose(); setFormTitle(''); setFormUrl(''); setFormAreaId(''); } catch (error) { showNotification("Errore", "error"); } finally { setIsSaving(false); } };
    const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', boxSizing: 'border-box' };
    return ReactDOM.createPortal( <><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',backgroundColor:'rgba(0,0,0,0.6)',zIndex:99998}} onClick={onClose}/><div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}><div style={{backgroundColor:'#fff',width:'100%',maxWidth:'500px',borderRadius:'12px',overflow:'hidden',pointerEvents:'auto', margin: '0 15px'}} onClick={e=>e.stopPropagation()}><div style={{padding:'20px'}}><h3 style={{margin:0, marginBottom:'20px', fontSize:'18px', fontWeight:'bold', color:'#0f172a'}}>🔗 Nuovo Modulo</h3><form onSubmit={handleSave}><input placeholder="Titolo Modulo" value={formTitle} onChange={e=>setFormTitle(e.target.value)} style={inputStyle}/><input placeholder="URL Modulo (Google Forms)" value={formUrl} onChange={e=>setFormUrl(e.target.value)} style={inputStyle}/><select value={formAreaId} onChange={e=>setFormAreaId(e.target.value)} style={inputStyle}><option value="">-- Seleziona Area --</option>{availableAreas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><div style={{display:'flex', justifyContent:'flex-end', gap:'10px'}}><button type="button" onClick={onClose} className="modern-btn-outline">Annulla</button><button type="submit" disabled={isSaving} className="modern-btn">Salva</button></div></form></div></div></div></>, document.body );
};

// ===========================================
// --- VISTE SECONDARIE (CON DATA-LABEL PER MOBILE) ---
// ===========================================

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, showArchived, setShowArchived }) => { 
    const getSortIndicator = (key) => { if (!sortConfig || sortConfig.key !== key) return ''; return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'; };
    return (
        <div className="modern-table-wrapper">
            <table className="modern-table">
                <thead>
                    <tr>
                        <th style={{cursor: 'pointer'}} onClick={() => requestSort('name')}>Dipendente {getSortIndicator('name')}</th>
                        <th>Stato Attuale</th>
                        <th>Aree Assegnate</th>
                        <th style={{textAlign: 'right'}}>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    {employees.map(emp => {
                        const isClockedIn = !!emp.activeEntry;
                        const hasCompletedPause = emp.activeEntry?.pauses && emp.activeEntry.pauses.length > 0;
                        const initial = emp.name ? emp.name.charAt(0).toUpperCase() : '?';

                        return (
                            <tr key={emp.id} style={{ opacity: emp.isDeleted ? 0.6 : 1, background: emp.isDeleted ? '#fdf2f8' : 'transparent' }}>
                                <td data-label="Dipendente">
                                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', justifyContent: window.innerWidth <= 768 ? 'flex-end' : 'flex-start'}}>
                                        <div className="modern-avatar">{initial}</div>
                                        <div style={{textAlign: window.innerWidth <= 768 ? 'right' : 'left'}}>
                                            <div style={{fontWeight: '700', color: emp.isDeleted ? '#be123c' : '#1e293b', textDecoration: emp.isDeleted ? 'line-through' : 'none'}}>
                                                {emp.name} {emp.surname}
                                            </div>
                                            {emp.isDeleted && <span style={{fontSize: '11px', color: '#be123c', fontWeight: 'bold'}}>ARCHIVIATO</span>}
                                        </div>
                                    </div>
                                </td>
                                <td data-label="Stato Attuale">
                                    {emp.isDeleted ? <span className="modern-badge red">Disattivato</span> : 
                                        emp.activeEntry && emp.activeEntry.isAbsence ? 
                                            <span className="modern-badge purple">{emp.activeEntry.note || 'GIUSTIFICATO'}</span> 
                                        : 
                                            <span className={`modern-badge ${isClockedIn ? 'green' : 'red'}`}>
                                                {isClockedIn ? '🟢 Al Lavoro' : '🔴 Non al lavoro'}
                                            </span>
                                    }
                                </td>
                                <td data-label="Aree Assegnate">
                                    <div style={{maxWidth: '250px', whiteSpace: 'normal', overflow: 'hidden', color: '#64748b', fontSize: '13px', textAlign: window.innerWidth <= 768 ? 'right' : 'left'}}>
                                        {emp.workAreaNames?.join(', ') || 'Nessuna area'}
                                    </div>
                                </td>
                                <td data-label="Azioni" className="actions-cell">
                                    {!emp.isDeleted ? (
                                        <button onClick={() => openModal('employeeActions', emp)} className="modern-btn">⚙️ Gestisci</button>
                                    ) : (
                                        currentUserRole === 'admin' && <button onClick={()=>openModal('restoreEmployee', emp)} className="modern-btn-outline" style={{color: '#16a34a', borderColor: '#bbf7d0'}}>♻️ Ripristina</button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {employees.length === 0 && <div style={{padding: '30px', textAlign: 'center', color: '#94a3b8', fontWeight: 'bold'}}>Nessun dipendente trovato.</div>}
        </div>
    );
};

const AreaManagementView = ({ workAreas, openModal, currentUserRole, handleArchiveArea, handleRestoreArea }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const filteredAreas = workAreas.filter(area => {
        const matchesSearch = area.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesArchive = showArchived ? area.isArchived : !area.isArchived;
        return matchesSearch && matchesArchive;
    });
    return (
        <>
            <div className="modern-title" style={{border: 'none', marginBottom: '10px'}}>
                <div style={{display:'flex', gap:'10px', width:'100%', flexWrap: 'wrap'}}>
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="🔍 Cerca cantiere..." className="modern-input" style={{flex: 1, minWidth: '200px', maxWidth: '100%'}} />
                    <button onClick={() => setShowArchived(!showArchived)} className="modern-btn-outline" style={{width: window.innerWidth <= 768 ? '100%' : 'auto'}}>{showArchived ? '📂 Nascondi Archiviate' : '📂 Mostra Archiviate'}</button>
                </div>
            </div>
            <div className="modern-table-wrapper">
                <table className="modern-table">
                    <thead><tr><th>Nome Cantiere</th><th>Ore Erogate</th><th>Pausa Default</th>{currentUserRole === 'admin' && (<><th>Coordinate GPS</th><th>Raggio</th></>)}<th style={{textAlign:'right'}}>Azioni</th></tr></thead>
                    <tbody>
                        {filteredAreas.map(area => (
                            <tr key={area.id} style={{ opacity: area.isArchived ? 0.6 : 1, background: area.isArchived ? '#f8fafc' : 'transparent' }}>
                                <td data-label="Cantiere" style={{fontWeight: '700', color: '#1e293b'}}>{area.isArchived && "🔒 "}{area.name}</td>
                                <td data-label="Ore Erogate"><span className="modern-badge blue">{area.totalHours ? `${area.totalHours}h` : '0h'}</span></td>
                                <td data-label="Pausa"><span className="modern-badge outline" style={{border: '1px solid #cbd5e1', color: '#64748b'}}>⏱️ {area.pauseDuration || 0} min</span></td>
                                {currentUserRole === 'admin' && (<><td data-label="GPS" style={{fontFamily: 'monospace', color: '#94a3b8'}}>{area.latitude?.toFixed(4)}, {area.longitude?.toFixed(4)}</td><td data-label="Raggio">{area.radius || 0}m</td></>)}
                                <td data-label="Azioni" className="actions-cell">
                                    {!area.isArchived ? (
                                        <>
                                            {currentUserRole === 'admin' && <button onClick={() => openModal('editArea', area)} className="modern-btn-outline" style={{color:'#2563eb', borderColor:'#bfdbfe'}}>✏️ Modifica</button>}
                                            {currentUserRole === 'preposto' && <button onClick={() => openModal('editAreaPauseOnly', area)} className="modern-btn-outline">⏱️ Pausa</button>}
                                            {currentUserRole === 'admin' && <button onClick={() => handleArchiveArea(area)} className="modern-btn-danger">📂 Archivia</button>}
                                        </>
                                    ) : (
                                        currentUserRole === 'admin' && <button onClick={() => handleRestoreArea(area)} className="modern-btn" style={{background: '#16a34a'}}>♻️ Ripristina</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
};

const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole, onDataUpdate, searchTerm }) => {
    if (currentUserRole !== 'admin') { return <div className="modern-card"><div style={{color:'#ef4444'}}>Accesso negato.</div></div>; }
    const filteredAdmins = admins.filter(admin => admin.email !== superAdminEmail);
    const displayedAdmins = filteredAdmins.filter(admin => { if (!searchTerm) return true; const term = searchTerm.toLowerCase(); return (`${admin.name} ${admin.surname}`.toLowerCase().includes(term) || admin.email.toLowerCase().includes(term)); });
    
    return (
        <div className="modern-table-wrapper">
            <table className="modern-table">
                <thead><tr><th>Utente</th><th>Ruolo</th><th>Aree Assegnate</th><th style={{textAlign:'right'}}>Azioni</th></tr></thead>
                <tbody>
                    {displayedAdmins.map(admin => (
                        <tr key={admin.id}>
                            <td data-label="Utente"><div style={{fontWeight:'700', color:'#0f172a'}}>{admin.name} {admin.surname}</div><div style={{fontSize:'12px', color:'#64748b'}}>{admin.email}</div></td>
                            <td data-label="Ruolo"><span className={`modern-badge ${admin.role === 'admin' ? 'purple' : 'blue'}`}>{admin.role}</span></td>
                            <td data-label="Aree" style={{color:'#64748b'}}>{admin.managedAreaNames?.join(', ') || '-'}</td>
                            <td data-label="Azioni" className="actions-cell">
                                {currentUserRole === 'admin' && (<button onClick={() => openModal('deleteAdmin', admin)} className="modern-btn-danger" disabled={admin.email === user?.email}>🗑️ Elimina</button>)}
                                {admin.role === 'preposto' && (<button onClick={() => openModal('assignPrepostoAreas', admin)} className="modern-btn" style={{background:'#3b82f6'}}>🌍 Aree</button>)}
                            </td>
                        </tr>
                    ))}
                    {displayedAdmins.length === 0 && <tr><td colSpan={4} style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>Nessun admin trovato.</td></tr>}
                </tbody>
            </table>
        </div>
    );
};

const ExpensesView = ({ expenses, onProcessExpense, onBulkProcessExpense, onEditExpense, currentUserRole, user, searchTerm, showArchived }) => {
    const displayedExpenses = expenses.filter(exp => {
        const isClosed = exp.status === 'closed' || exp.status === 'paid';
        const matchesArchive = showArchived ? isClosed : !isClosed;
        const isOwner = exp.userId === user.uid;
        if (currentUserRole !== 'admin' && !isOwner) return false;
        if (searchTerm) { if (!exp.userName || !exp.userName.toLowerCase().includes(searchTerm.toLowerCase())) return false; }
        return matchesArchive;
    });

    const totalAmount = displayedExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

    return (
        <div>
            {!showArchived && currentUserRole === 'admin' && displayedExpenses.length > 0 && (
                <div style={{marginBottom: 15, display: 'flex', justifyContent: 'flex-end'}}>
                     <button 
                         onClick={() => onBulkProcessExpense(displayedExpenses)} 
                         className="modern-btn" 
                         style={{background: '#52c41a', fontSize: '15px'}}
                     >
                         ✅ Salda Tutte le Spese Visibili (€ {totalAmount.toFixed(2)})
                     </button>
                </div>
            )}
            
            <div className="modern-table-wrapper">
                <table className="modern-table">
                    <thead><tr><th>Data</th><th>Dipendente</th><th>Dettaglio</th><th>Allegato</th><th>Importo</th><th style={{textAlign:'right'}}>Azione</th></tr></thead>
                    <tbody>
                        {displayedExpenses.map(exp => (
                            <tr key={exp.id}>
                                <td data-label="Data" style={{color: '#64748b', fontWeight:'600'}}>{exp.date && exp.date.toDate ? exp.date.toDate().toLocaleDateString('it-IT') : new Date(exp.date).toLocaleDateString('it-IT')}</td>
                                <td data-label="Dipendente"><div style={{fontWeight: '700', color: '#0f172a'}}>{exp.userName}</div></td>
                                <td data-label="Dettaglio"><div style={{fontWeight: '600'}}>{exp.description}</div><div style={{fontSize:'12px', color:'#94a3b8'}}>{exp.note}</div></td>
                                <td data-label="Allegato">{exp.receiptUrl ? <a href={exp.receiptUrl} target="_blank" rel="noreferrer" style={{color:'#2563eb', fontWeight:'bold', textDecoration:'none'}}>📎 Apri</a> : <span style={{color:'#cbd5e1'}}>-</span>}</td>
                                <td data-label="Importo"><span className="modern-badge green" style={{fontSize:'14px'}}>€ {parseFloat(exp.amount).toFixed(2)}</span></td>
                                <td data-label="Azioni" className="actions-cell">
                                    {!showArchived ? (
                                        currentUserRole === 'admin' ? <button onClick={() => onProcessExpense(exp)} className="modern-btn" style={{background:'#16a34a'}}>✅ Gestisci</button> 
                                        : <button onClick={() => onEditExpense(exp)} className="modern-btn" style={{background:'#f59e0b'}}>✏️ Modifica</button>
                                    ) : (
                                        <span className="modern-badge outline" style={{border:'1px solid #cbd5e1', color:'#64748b'}}>Chiuso: {exp.adminPaymentMethod}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {displayedExpenses.length === 0 && <tr><td colSpan={6} style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>Nessuna spesa trovata.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ReportView = ({ reports, title, handleExportXml, dateRange, allWorkAreas, allEmployees, currentUserRole, userData, setDateRange, setReportAreaFilter, reportAreaFilter, reportEmployeeFilter, setReportEmployeeFilter, generateReport, isLoading, isActionLoading, managedEmployees, showNotification, handleReviewSkipBreak, onEditEntry, handleSaveEntryEdit }) => {
    
    const handleExportPayrollExcel = () => { 
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') { showNotification("Libreria esportazione non caricata.", 'error'); return; } 
        if (!reports || reports.length === 0) { showNotification("Nessun dato da esportare per il report paghe.", 'info'); return; } 
        const centerStyle = { vertical: 'center', horizontal: 'center' }; 
        const areaColorMap = {}; 
        allWorkAreas.forEach((area, index) => { areaColorMap[area.id] = AREA_COLORS[index % AREA_COLORS.length]; }); 
        const start = new Date(dateRange.start); 
        const end = new Date(dateRange.end); 
        const dateArray = []; let current = new Date(start); 
        while (current <= end) { dateArray.push(new Date(current)); current.setDate(current.getDate() + 1); } 
        const empData = {}; const areaStats = {}; 
        reports.forEach(r => { 
            if (r.isAbsence) return; 
            if (!empData[r.employeeId]) { empData[r.employeeId] = { name: r.employeeName, dailyData: {}, total: 0 }; } 
            const hours = parseFloat(r.duration || 0); 
            const parts = r.clockInDate.split('/'); 
            const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 
            if (!empData[r.employeeId].dailyData[isoDate]) { empData[r.employeeId].dailyData[isoDate] = { hours: 0, areaId: null }; } 
            const currentDayData = empData[r.employeeId].dailyData[isoDate]; 
            currentDayData.hours += hours; currentDayData.areaId = r.workAreaId; 
            empData[r.employeeId].total += hours; 
            const areaName = r.areaName || "Sconosciuta"; 
            if (!areaStats[areaName]) areaStats[areaName] = 0; 
            areaStats[areaName] += hours; 
        }); 
        const startObj = new Date(dateRange.start); 
        const monthName = startObj.toLocaleString('it-IT', { month: 'long' }); 
        const headerLabel = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${startObj.getFullYear().toString().slice(-2)}`; 
        const headerRow1 = [{ v: headerLabel, t: 's', s: { font: { bold: true }, alignment: centerStyle } }]; 
        const headerRow2 = [{ v: "DIPENDENTE", t: 's', s: { alignment: centerStyle } }]; 
        const daysOfWeek = ['D', 'L', 'M', 'M', 'G', 'V', 'S']; 
        dateArray.forEach(d => { headerRow1.push({ v: d.getDate(), t: 'n', s: { alignment: centerStyle } }); headerRow2.push({ v: daysOfWeek[d.getDay()], t: 's', s: { alignment: centerStyle } }); }); 
        headerRow1.push({ v: "TOTALE", t: 's', s: { font: { bold: true }, alignment: centerStyle } }); 
        headerRow2.push({ v: "", t: 's', s: { alignment: centerStyle } }); 
        const sheetData = [headerRow1, headerRow2]; 
        const sortedEmployees = Object.values(empData).sort((a,b) => a.name.localeCompare(b.name)); 
        sortedEmployees.forEach(emp => { 
            const row = [{ v: emp.name, t: 's', s: { alignment: centerStyle } }]; 
            dateArray.forEach(d => { 
                const iso = d.toISOString().split('T')[0]; const dayData = emp.dailyData[iso]; 
                if (dayData && dayData.hours > 0) { 
                    const cell = { v: Number(dayData.hours.toFixed(2)), t: 'n', s: { fill: { fgColor: { rgb: areaColorMap[dayData.areaId] || "FFFFFF" } }, alignment: centerStyle } }; 
                    row.push(cell); 
                } else { row.push({ v: "", t: 's', s: { alignment: centerStyle } }); } 
            }); 
            row.push({ v: Number(emp.total.toFixed(2)), t: 'n', s: { alignment: centerStyle, font: { bold: true } } }); 
            sheetData.push(row); 
        }); 
        sheetData.push([]); sheetData.push([]); 
        sheetData.push([ { v: "RIEPILOGO PER AREA", t: 's', s: { font: { bold: true }, alignment: centerStyle } }, { v: "TOT", t: 's', s: { font: { bold: true }, alignment: centerStyle } } ]); 
        Object.keys(areaStats).sort().forEach(areaName => { 
            const areaObj = allWorkAreas.find(a => a.name === areaName); 
            const color = areaObj ? (areaColorMap[areaObj.id] || "FFFFFF") : "FFFFFF"; 
            const cellName = { v: areaName, t: 's', s: { fill: { fgColor: { rgb: color } }, font: { bold: true }, alignment: centerStyle } }; 
            const cellVal = { v: Number(areaStats[areaName].toFixed(2)), t: 'n', s: { alignment: centerStyle } }; 
            sheetData.push([cellName, cellVal]); 
        }); 
        const ws = utils.aoa_to_sheet(sheetData); 
        const wscols = [{wch: 30}]; dateArray.forEach(() => wscols.push({wch: 5})); wscols.push({wch: 12}); ws['!cols'] = wscols; 
        const wb = utils.book_new(); utils.book_append_sheet(wb, ws, "Foglio Presenze"); 
        writeFile(wb, `Report_Paghe_${dateRange.start}_${dateRange.end}.xlsx`); 
        showNotification("Excel Paghe generato con successo!", 'success'); 
    };

    const handleExportExcel = () => { if (typeof utils === 'undefined' || typeof writeFile === 'undefined') { showNotification("Libreria esportazione non caricata.", 'error'); return; } if (!reports || reports.length === 0) { showNotification("Nessun dato da esportare.", 'info'); return; } const dataToExport = reports.map(entry => ({ 'ID Dipendente': entry.employeeId, 'Dipendente': entry.employeeName, 'ID Area': entry.workAreaId || 'N/A', 'Area': entry.areaName, 'Data': entry.clockInDate, 'Entrata': entry.clockInTimeFormatted, 'Uscita': entry.clockOutTimeFormatted, 'Ore Lavorate (Netto)': entry.isAbsence ? 0 : ((entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso"), 'Pausa Totale (Ore)': (entry.pauseHours !== null) ? parseFloat(entry.pauseHours.toFixed(2)) : 0, 'Stato Pausa': entry.skippedBreak ? (entry.skipBreakStatus === 'approved' ? 'No Pausa (Approvato)' : 'Pausa Scalata (Default)') : 'Standard', 'Motivo/Nota': entry.note })); const ws = utils.json_to_sheet(dataToExport); const wb = utils.book_new(); utils.book_append_sheet(wb, ws, "Report Ore"); ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 30 }]; writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`); showNotification(`File Excel generato con successo.`, 'success'); };
    
    return (
        <div className="modern-card mt-6">
            <div className="modern-title">
                <div>📊 {title || 'Risultati'}</div>
                <div className="title-actions">
                    <button onClick={handleExportExcel} disabled={!reports || reports.length === 0} className="modern-btn" style={{background:'#10b981'}}>📥 Excel</button>
                    <button onClick={handleExportPayrollExcel} disabled={!reports || reports.length === 0} className="modern-btn" style={{background:'#6366f1'}}>📥 Paghe</button>
                    <button onClick={() => handleExportXml(reports)} disabled={!reports || reports.length === 0} className="modern-btn-outline">📥 XML</button>
                </div>
            </div>
            <div className="modern-table-wrapper">
                <table className="modern-table">
                    <thead><tr><th>Dipendente</th><th>Cantiere</th><th>Data</th><th>Orari</th><th>Ore Nette</th><th>Stato Pausa</th><th style={{textAlign:'right'}}>Azioni</th></tr></thead>
                    <tbody>
                        {reports.map((entry) => (
                            <tr key={entry.id} style={{background: entry.isAbsence ? '#fdf2f8' : 'transparent'}}>
                                <td data-label="Dipendente" style={{fontWeight:'700'}}>{entry.employeeName}</td>
                                <td data-label="Cantiere">{entry.isAbsence ? <span style={{color:'#cbd5e1'}}>-</span> : <span className="modern-badge blue">{entry.areaName}</span>}</td>
                                <td data-label="Data" style={{color:'#64748b', fontWeight:'600'}}>{entry.clockInDate}</td>
                                {entry.isAbsence ? (
                                    <>
                                        <td data-label="Stato"><span className="modern-badge purple">{entry.statusLabel}</span></td>
                                        <td data-label="Ore Nette">-</td>
                                        <td data-label="Pausa">-</td>
                                        <td data-label="Azioni" className="actions-cell">
                                            <div style={{fontSize:'12px', color:'#64748b'}}>{entry.note}</div>
                                            <button onClick={() => onEditEntry(entry)} className="modern-btn-outline" style={{padding:'4px 8px', fontSize:'11px'}}>📝 Modifica</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td data-label="Orari" style={{fontFamily:'monospace', color:'#475569'}}>{entry.clockInTimeFormatted} - {entry.clockOutTimeFormatted}</td>
                                        <td data-label="Ore Nette"><span className="modern-badge green" style={{fontSize:'14px'}}>{entry.duration !== null ? entry.duration.toFixed(2) : '...'} h</span></td>
                                        <td data-label="Pausa">{entry.skippedBreak ? (entry.skipBreakStatus === 'pending' ? <span className="modern-badge orange">⚠️ Verifica</span> : entry.skipBreakStatus === 'approved' ? <span className="modern-badge green">✅ Approvata</span> : <span className="modern-badge red">❌ Scalata</span>) : (<span style={{color:'#94a3b8', fontSize:'12px'}}>Standard ({entry.pauseHours !== null ? entry.pauseHours.toFixed(2) : '0.00'}h)</span>)}</td>
                                        <td data-label="Azioni" className="actions-cell">
                                            {entry.skippedBreak && entry.skipBreakStatus === 'pending' && (
                                                <div style={{display:'flex', gap:'5px'}}>
                                                    <button onClick={() => handleReviewSkipBreak(entry.id, 'approved')} className="modern-btn" style={{padding:'4px 8px', fontSize:'11px', background:'#16a34a'}}>Approva</button>
                                                    <button onClick={() => handleReviewSkipBreak(entry.id, 'rejected')} className="modern-btn-danger" style={{padding:'4px 8px', fontSize:'11px'}}>Rifiuta</button>
                                                </div>
                                            )}
                                            <button onClick={() => onEditEntry(entry)} className="modern-btn-outline" style={{padding:'4px 8px', fontSize:'11px'}}>✏️ Modifica</button>
                                            {entry.note && <span style={{fontSize:'11px', color:'#94a3b8', maxWidth:'150px', display:'inline-block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}} title={entry.note}>{entry.note}</span>}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                        {(!reports || reports.length === 0) && <tr><td colSpan={7} style={{textAlign:'center', padding:'40px', color:'#94a3b8'}}>Nessun dato per il periodo selezionato.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ===========================================
// --- DASHBOARD COMPONENT ---
// ===========================================
const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours, workAreas, adminEmployeeProfile, adminActiveEntry, handleAdminPause, openModal, isActionLoading, dashboardAreaFilter, setDashboardAreaFilter, todayHoursDetail }) => {
    const [isMapMode, setIsMapMode] = useState(false);
    const [myEquipment, setMyEquipment] = useState([]);
    const [myVehicles, setMyVehicles] = useState([]);
    const [showAssets, setShowAssets] = useState(false);
    const [isHoursModalVisible, setIsHoursModalVisible] = useState(false); 

    useEffect(() => {
        if (!adminEmployeeProfile?.id) return;
        let isMounted = true;
        const fetchAssets = async () => {
            try {
                const qEq = query(collection(db, "equipment"), where("assignedToUserId", "==", adminEmployeeProfile.id), where("status", "==", "in_use"));
                const snapEq = await getDocs(qEq);
                const qVeh = query(collection(db, "vehicles"), where("assignedTo", "==", adminEmployeeProfile.id));
                const snapVeh = await getDocs(qVeh);
                if (isMounted) {
                    setMyEquipment(snapEq.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                    setMyVehicles(snapVeh.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(v => v.status === 'active' && !v.isRentalReturned));
                }
            } catch (error) { console.error(error); }
        };
        fetchAssets();
        return () => { isMounted = false; };
    }, [adminEmployeeProfile]);

    const isOnBreak = adminActiveEntry?.status === 'In Pausa' || adminActiveEntry?.isOnBreak;
    const hasCompletedPause = adminActiveEntry?.hasCompletedPause || false;

    return (
        <div className="modern-card" style={{borderTop: '4px solid #3b82f6'}}>
            <div className="modern-title" style={{border: 'none', display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
                <div>{isMapMode ? '🌍 Mappa Cantieri' : '⚡ Monitoraggio Operativo'}</div>
                <div style={{display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap'}}>
                    {!isMapMode && (
                        <select 
                            className="modern-input" 
                            value={dashboardAreaFilter} 
                            onChange={e => setDashboardAreaFilter(e.target.value)}
                            style={{width: 'auto', minWidth: '200px', margin: 0, padding: '8px 12px', fontWeight: 'bold'}}
                        >
                            <option value="all">Tutti i Miei Cantieri</option>
                            {[...workAreas].sort((a,b) => a.name.localeCompare(b.name)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}
                    <button onClick={() => setIsMapMode(!isMapMode)} className="modern-btn-outline" style={{width: window.innerWidth <= 768 ? '100%' : 'auto'}}>{isMapMode ? '🔙 Torna ai Dati' : '🌍 Apri Mappa'}</button>
                </div>
            </div>
            
            {!isMapMode && (
                <>
                    {/* BOTTONI CENTRALI AGGIORNATI E POTENZIATI */}
                    {adminEmployeeProfile && (
                        <div className="quick-actions" style={{background:'#f8fafc', padding:'20px', borderRadius:'12px', display:'flex', flexWrap: 'wrap', justifyContent:'center', alignItems: 'center', gap:'15px', marginBottom:'30px', border:'1px solid #e2e8f0'}}>
                            {!adminActiveEntry ? (
                                <>
                                    <div style={{fontSize: '16px', fontWeight: 'bold', color: '#64748b'}}>⚪ Fuori Turno</div>
                                    <button onClick={() => openModal('manualClockIn', adminEmployeeProfile)} disabled={isActionLoading} className="modern-btn" style={{background: '#16a34a', fontSize:'16px', padding: '12px 24px'}}>▶️ Entra in Turno</button>
                                </>
                            ) : (
                                <>
                                    <div style={{fontSize: '16px', fontWeight: 'bold', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        🟢 In Turno {isOnBreak && <span style={{color: '#d97706', fontSize: '14px'}}>(In Pausa)</span>}
                                    </div>

                                    <button 
                                        onClick={handleAdminPause} 
                                        disabled={isActionLoading || (!isOnBreak && hasCompletedPause)} 
                                        className="modern-btn-outline" 
                                        style={{
                                            fontSize:'15px', 
                                            padding: '10px 20px',
                                            background: (!isOnBreak && hasCompletedPause) ? '#f1f5f9' : (isOnBreak ? '#fef08a' : '#fff'),
                                            color: (!isOnBreak && hasCompletedPause) ? '#94a3b8' : (isOnBreak ? '#d97706' : '#475569'),
                                            borderColor: (!isOnBreak && hasCompletedPause) ? '#cbd5e1' : (isOnBreak ? '#fde047' : '#cbd5e1'),
                                            cursor: (!isOnBreak && hasCompletedPause) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {isOnBreak ? '▶️ Termina Pausa' : (hasCompletedPause ? '✔️ Pausa Eseguita' : '☕ Pausa')}
                                    </button>

                                    <button 
                                        onClick={() => openModal('manualClockOut', adminEmployeeProfile)} 
                                        disabled={isOnBreak || isActionLoading} 
                                        className="modern-btn-danger" 
                                        style={{fontSize:'15px', padding: '10px 20px', opacity: isOnBreak ? 0.5 : 1, cursor: isOnBreak ? 'not-allowed' : 'pointer'}}
                                    >
                                        ⏹️ Esci Turno
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="dashboard-stats" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))', gap:'20px', marginBottom:'30px'}}>
                        <div className="stat-card" style={{background:'#fff', padding:'24px', borderRadius:'12px', borderLeft:'5px solid #3b82f6', boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>
                            <p className="stat-label" style={{margin:0, color:'#64748b', fontSize:'13px', fontWeight:'700', textTransform:'uppercase'}}>Forza Lavoro Attiva</p>
                            <p className="stat-value" style={{margin:'10px 0 0 0', fontSize:'32px', fontWeight:'900', color: '#0f172a'}}>{activeEmployeesDetails.length} <span style={{fontSize:'16px', color:'#94a3b8', fontWeight:'500'}}>/ {totalEmployees}</span></p>
                        </div>
                        {/* RIQUADRO ORE CLICCABILE */}
                        <div 
                            className="stat-card" 
                            style={{background:'#fff', padding:'24px', borderRadius:'12px', borderLeft:'5px solid #10b981', boxShadow:'0 2px 12px rgba(0,0,0,0.04)', cursor: 'pointer', transition: '0.2s'}}
                            onClick={() => setIsHoursModalVisible(true)}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                <p className="stat-label" style={{margin:0, color:'#64748b', fontSize:'13px', fontWeight:'700', textTransform:'uppercase'}}>Ore Erogate Oggi {dashboardAreaFilter !== 'all' ? '(Area Sel.)' : ''}</p>
                                <Tooltip title="Clicca per vedere i dettagli"><InfoCircleOutlined style={{color: '#10b981', fontSize: '18px'}}/></Tooltip>
                            </div>
                            <p className="stat-value" style={{margin:'10px 0 0 0', fontSize:'32px', fontWeight:'900', color: '#0f172a'}}>{totalDayHours}</p>
                        </div>
                    </div>

                    {adminEmployeeProfile && (myEquipment.length > 0 || myVehicles.length > 0) && (
                        <div style={{background:'#fff', borderRadius:'12px', border:'1px solid #e2e8f0', overflow:'hidden', marginBottom:'30px'}}>
                            <button onClick={() => setShowAssets(!showAssets)} style={{width:'100%', padding:'20px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', border:'none', cursor:'pointer'}}>
                                <span style={{fontWeight:'800', fontSize:'16px', color:'#1e293b'}}>📦 Le Mie Dotazioni Aziendali</span>
                                <span className="modern-badge blue">{showAssets ? 'NASCONDI ▲' : 'VEDI DETTAGLI ▼'}</span>
                            </button>
                            {showAssets && (
                                <div style={{padding:'24px', borderTop:'1px solid #f1f5f9', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'20px'}}>
                                    {myVehicles.length > 0 && (
                                        <div><h3 style={{color:'#1e40af', borderBottom:'2px solid #bfdbfe', paddingBottom:'8px', fontSize:'15px', fontWeight:'800'}}>🚐 Veicoli</h3>
                                        {myVehicles.map(v => (<div key={v.id} style={{padding:'12px', background:'#eff6ff', borderRadius:'8px', marginBottom:'10px', border:'1px solid #dbeafe'}}><div style={{fontWeight:'bold', color: '#1e3a8a', fontSize:'15px'}}>{v.brand} {v.model}</div><div style={{fontSize:'13px', marginTop: '4px', color: '#60a5fa'}}>Targa: <span style={{fontFamily:'monospace', background:'#fff', padding:'2px 6px', borderRadius:'4px', color: '#1e40af', fontWeight: 'bold'}}>{v.plate}</span></div></div>))}</div>
                                    )}
                                    {myEquipment.length > 0 && (
                                        <div><h3 style={{color:'#9a3412', borderBottom:'2px solid #fed7aa', paddingBottom:'8px', fontSize:'15px', fontWeight:'800'}}>🛠️ Attrezzatura</h3>
                                        {myEquipment.map(eq => (<div key={eq.id} style={{padding:'12px', background:'#fff7ed', borderRadius:'8px', marginBottom:'10px', border:'1px solid #ffedd5'}}><div style={{fontWeight:'bold', color: '#9a3412', fontSize:'15px'}}>{eq.name}</div><div style={{fontSize:'13px', color: '#c2410c'}}>{eq.brand}</div></div>))}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <h2 style={{fontSize:'20px', fontWeight:'800', color: '#1e293b', marginBottom:'16px'}}>Elenco Presenze Live</h2>
                    <div className="modern-table-wrapper">
                        <table className="modern-table">
                            <thead><tr><th>Dipendente</th><th>Cantiere</th><th>Ingresso</th><th>Stato</th><th>Pausa Default</th></tr></thead>
                            <tbody>
                                {activeEmployeesDetails.map(entry => {
                                    const pauseDone = entry.pauses && entry.pauses.length > 0;
                                    return (
                                        <tr key={entry.id}>
                                            <td data-label="Dipendente" style={{fontWeight:'700', fontSize:'15px'}}>{entry.employeeName}</td>
                                            <td data-label="Cantiere"><span className="modern-badge blue">{entry.areaName}</span></td>
                                            <td data-label="Ingresso" style={{fontFamily:'monospace', fontSize:'14px', color:'#475569'}}>{entry.clockInTimeFormatted}</td>
                                            <td data-label="Stato"><span className="modern-badge green">Al Lavoro</span></td>
                                            <td data-label="Pausa" style={{fontWeight:'600', color: pauseDone ? '#16a34a' : '#94a3b8'}}>{pauseDone ? '✓ Eseguita' : '-'}</td>
                                        </tr>
                                    );
                                })}
                                {activeEmployeesDetails.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:'40px', color:'#94a3b8', fontWeight:'600'}}>Nessun dipendente in cantiere.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {isMapMode && (
                <div style={{ height: '500px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <MappaPresenze aree={workAreas} presenzeAttive={activeEmployeesDetails} />
                </div>
            )}

            {/* MODALE TRASPARENZA ORE */}
            <Modal 
                title={<span><InfoCircleOutlined style={{color:'#10b981'}} /> Dettaglio Matematico Ore di Oggi</span>} 
                open={isHoursModalVisible} 
                onCancel={() => setIsHoursModalVisible(false)} 
                footer={[<Button key="close" onClick={() => setIsHoursModalVisible(false)}>Chiudi</Button>]}
            >
                <div style={{marginBottom: 15, fontSize: 13, color: '#64748b'}}>
                    Questo pannello ti mostra esattamente chi ha lavorato oggi nel cantiere selezionato e quante ore ha prodotto fino a questo momento (incluse le persone che hanno già staccato). Se vedi righe doppie, controlla in "Report Ore".
                </div>
                <Table 
                    dataSource={todayHoursDetail} 
                    size="small" 
                    pagination={false} 
                    rowKey="id"
                    columns={[
                        {title: 'Dipendente', dataIndex: 'employeeName', render: t => <b>{t}</b>},
                        {title: 'Stato', dataIndex: 'status', render: s => s === 'clocked-in' ? <Tag color="green">Attivo</Tag> : <Tag color="default">Chiuso</Tag>},
                        {title: 'Orario', render: (_, r) => <span style={{fontFamily: 'monospace', fontSize: 12}}>{r.clockIn} - {r.clockOut}</span>},
                        {title: 'Ore Nette', dataIndex: 'hours', align: 'right', render: h => <b style={{color: '#10b981'}}>{h} h</b>}
                    ]}
                />
            </Modal>
        </div>
    );
};


// ===========================================
// --- COMPONENTE PRINCIPALE (LOGICA) ---
// ===========================================

const AdminDashboard = ({ user, handleLogout, userData }) => {

    const [view, setView] = useState('dashboard');
    const [allEmployees, setAllEmployees] = useState([]); 
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEmployeesDetails, setActiveEmployeesDetails] = useState([]);
    const [activeWorkers, setActiveWorkers] = useState([]);
    const [absentWorkers, setAbsentWorkers] = useState([]);
    const [reports, setReports] = useState([]);
    const [forms, setForms] = useState([]);
    const [expenses, setExpenses] = useState([]); 
    const [showArchived, setShowArchived] = useState(false);
    
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);

    const [isLoading, setIsLoading] = useState(true); 
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
    const [dateRange, setDateRange] = useState({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
    const [reportAreaFilter, setReportAreaFilter] = useState('all');
    const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
    const [reportTitle, setReportTitle] = useState('');
    const [adminEmployeeProfile, setAdminEmployeeProfile] = useState(null);
    const [adminActiveEntry, setAdminActiveEntry] = useState(null);
    const [totalDayHours, setTotalDayHours] = useState('0.00');
    const [todayHoursDetail, setTodayHoursDetail] = useState([]); 

    const [workAreasWithHours, setWorkAreasWithHours] = useState([]);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0); 
    const [notification, setNotification] = useState(null); 
    
    const [dashboardAreaFilter, setDashboardAreaFilter] = useState('all');

    const [entryToEdit, setEntryToEdit] = useState(null);
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showAddFormModal, setShowAddFormModal] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    
    // --- STATI PER IL SALDO DELLE SPESE ---
    const [expenseToProcess, setExpenseToProcess] = useState(null); 
    const [expenseToEdit, setExpenseToEdit] = useState(null); 
    const [isSettlingAll, setIsSettlingAll] = useState(false);
    const [bulkExpensesToProcess, setBulkExpensesToProcess] = useState([]);

    const currentUserRole = userData?.role;
    const superAdminEmail = SUPER_ADMIN_EMAIL; 

    const handleSwitchView = (newView) => { setView(newView); };
    const showNotification = useCallback((message, type = 'success') => { setNotification({ message, type }); setTimeout(() => setNotification(null), 4000); }, []);

    const activeWorkAreas = useMemo(() => allWorkAreas.filter(a => !a.isArchived), [allWorkAreas]);

    const managedEmployees = useMemo(() => {
        if (currentUserRole === 'admin') return allEmployees;
        if (currentUserRole === 'preposto') {
            const managedAreaIds = userData?.managedAreaIds || []; 
            if (managedAreaIds.length === 0) return [];
            return allEmployees.filter(emp => emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId)));
        }
        return []; 
    }, [allEmployees, currentUserRole, userData]);

    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') { setIsLoading(false); return; }
        let isMounted = true; 
        setIsLoading(true);
        try {
            const [areasSnap, empsSnap, formsSnap] = await Promise.all([getDocs(collection(db, "work_areas")), getDocs(collection(db, "employees")), getDocs(collection(db, "area_forms"))]);
            if (!isMounted) return;
            const allAreasList = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allEmployeesList = empsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            let allFormsList = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (role === 'preposto') { const managedIds = userData?.managedAreaIds || []; allFormsList = allFormsList.filter(f => managedIds.includes(f.workAreaId)); }
            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));
            setAllEmployees(allEmployeesList); 
            setForms(allFormsList);
            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) { const q = query(collection(db, "employees"), where("userId", "==", user.uid)); const adminEmployeeSnapshot = await getDocs(q); if (!isMounted) return; const profile = adminEmployeeSnapshot.empty ? null : { id: adminEmployeeSnapshot.docs[0].id, userId: user.uid, ...adminEmployeeSnapshot.docs[0].data() }; setAdminEmployeeProfile(profile); } else { setAdminEmployeeProfile(null); }
            if (role === 'admin') { const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"])); const adminsSnapshot = await getDocs(qAdmins); if (!isMounted) return; const adminUsers = adminsSnapshot.docs.map(doc => { const data = doc.data(); const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || []; return { id: doc.id, ...data, managedAreaNames }; }); setAdmins(adminUsers); } else { setAdmins([]); }
        } catch (error) { console.error("Errore caricamento dati statici:", error); if (isMounted) showNotification("Errore caricamento dati iniziali.", 'error'); } finally { if (isMounted) setIsLoading(false); }
        return () => { isMounted = false; };
    }, [user, userData, superAdminEmail, showNotification]);

    useEffect(() => { if (user && userData) fetchData(); }, [user, userData, fetchData]); 

    useEffect(() => {
        if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') return;
        const q = query(collection(db, "expenses"), orderBy("date", "desc"), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => { const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setExpenses(expensesData); }, (error) => { console.error("Errore listener spese:", error); });
        return () => unsubscribe();
    }, [currentUserRole]);

    useEffect(() => {
        const activeOnly = allEmployees.filter(e => !e.isDeleted);
        if (activeOnly.length > 0) { const violators = activeOnly.filter(e => e.deviceIds && e.deviceIds.length > MAX_DEVICE_LIMIT); if (violators.length > 0) { setTimeout(() => { showNotification(`ATTENZIONE: ${violators.length} dipendenti hanno superato il limite di ${MAX_DEVICE_LIMIT} dispositivi! Controlla la lista.`, 'error'); }, 1000); } }
    }, [allEmployees, showNotification]);

    useEffect(() => {
        const combined = [...activeWorkers, ...absentWorkers];
        const filteredDetails = combined.filter(detail => { 
            if (dashboardAreaFilter !== 'all' && detail.workAreaId !== dashboardAreaFilter) return false;

            if (currentUserRole === 'admin') return true; 
            if (currentUserRole === 'preposto') { 
                const managedAreaIds = userData?.managedAreaIds || []; 
                if (managedAreaIds.length === 0) return false; 
                return detail.workAreaId ? managedAreaIds.includes(detail.workAreaId) : true; 
            } 
            return false; 
        }).sort((a, b) => a.employeeName.localeCompare(b.employeeName)); 
        setActiveEmployeesDetails(filteredDetails);
    }, [activeWorkers, absentWorkers, currentUserRole, userData, dashboardAreaFilter]);

    const sortedAndFilteredEmployees = useMemo(() => {
        let baseList = managedEmployees;
        if (showArchived) { baseList = baseList.filter(emp => emp.isDeleted); } else { baseList = baseList.filter(emp => !emp.isDeleted); }
        const employeesWithDetails = baseList.map(emp => ({ ...emp, workAreaNames: (emp.workAreaIds || []).map(id => { const area = allWorkAreas.find(a => a.id === id); return area ? area.name : `ID Mancante`; }).filter(Boolean), activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null, }));
        let filterableItems = [...employeesWithDetails];
        if (searchTerm) { const lowercasedFilter = searchTerm.toLowerCase(); filterableItems = filterableItems.filter(emp => `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter)); }
        if (sortConfig.key) { filterableItems.sort((a, b) => { let aValue = (sortConfig.key === 'name') ? `${a.name} ${a.surname}` : a[sortConfig.key]; let bValue = (sortConfig.key === 'name') ? `${b.name} ${b.surname}` : b[sortConfig.key]; if (aValue == null) aValue = ''; if (bValue == null) bValue = ''; aValue = String(aValue); bValue = String(bValue); if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1; if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1; return 0; }); }
        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig, showArchived]); 

    const visibleWorkAreas = useMemo(() => {
        if (currentUserRole === 'admin') return workAreasWithHours;
        if (currentUserRole === 'preposto') { const managedAreaIds = userData?.managedAreaIds || []; return workAreasWithHours.filter(area => managedAreaIds.includes(area.id)); }
        return [];
    }, [workAreasWithHours, currentUserRole, userData]);

    const activeVisibleWorkAreas = useMemo(() => visibleWorkAreas.filter(a => !a.isArchived), [visibleWorkAreas]);

    const dashboardTotalEmployees = useMemo(() => {
        let baseList = managedEmployees.filter(e => !e.isDeleted);
        if (dashboardAreaFilter !== 'all') {
            baseList = baseList.filter(emp => emp.workAreaIds && emp.workAreaIds.includes(dashboardAreaFilter));
        }
        return baseList.length;
    }, [managedEmployees, dashboardAreaFilter]);

    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) return;
        let isMounted = true; 
        
        const qActive = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!isMounted) return; 
            const rawEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const oldestEntriesMap = new Map();
            rawEntriesList.forEach(entry => {
                if (!entry.clockInTime) return;
                const existing = oldestEntriesMap.get(entry.employeeId);
                const currentTime = entry.clockInTime.toMillis ? entry.clockInTime.toMillis() : new Date(entry.clockInTime).getTime();
                const existingTime = existing ? (existing.clockInTime.toMillis ? existing.clockInTime.toMillis() : new Date(existing.clockInTime).getTime()) : Infinity;
                
                if (!existing || currentTime < existingTime) {
                    oldestEntriesMap.set(entry.employeeId, entry);
                }
            });
            const activeEntriesList = Array.from(oldestEntriesMap.values());

            if (adminEmployeeProfile) { 
                const adminEntry = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id); 
                const hasCompletedPause = adminEntry?.pauses && adminEntry.pauses.length > 0;
                setAdminActiveEntry(adminEntry ? { ...adminEntry, id: adminEntry.id, hasCompletedPause: hasCompletedPause } : null); 
            }
            
            const todayStr = dayjs().format('DD/MM/YYYY');
            
            const details = activeEntriesList.filter(entry => entry.clockInTime).map(entry => { 
                const employee = allEmployees.find(emp => emp.id === entry.employeeId); 
                const area = allWorkAreas.find(ar => ar.id === entry.workAreaId); 
                const hasCompletedPause = entry.pauses && entry.pauses.length > 0;
                let clockInFormatted = 'N/D'; 
                
                if (entry.clockInTime && typeof entry.clockInTime.toDate === 'function') { 
                    try { 
                        const clockInDateObj = entry.clockInTime.toDate();
                        const timeStr = dayjs(clockInDateObj).format('HH:mm'); 
                        const actualDateStr = dayjs(clockInDateObj).format('DD/MM/YYYY');
                        
                        if (actualDateStr !== todayStr) {
                            clockInFormatted = `${actualDateStr} ${timeStr}`; 
                        } else {
                            clockInFormatted = timeStr;
                        }
                    } catch (e) { console.error("Errore formattazione ora entrata:", e); } 
                } 
                
                return { 
                    id: entry.id, employeeId: entry.employeeId, employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto', 
                    areaName: area ? area.name : 'Sconosciuta', workAreaId: entry.workAreaId, clockInTimeFormatted: clockInFormatted, 
                    status: 'Al Lavoro', pauses: entry.pauses || [], hasCompletedPause: hasCompletedPause, isAbsence: false 
                }; 
            });
            setActiveWorkers(details);
        }, (error) => { if (isMounted) { console.error("Errore listener timbratura attive:", error); showNotification("Errore aggiornamento presenze.", 'error'); } });

        const todayStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const qAbsence = query(collection(db, "time_entries"), where("isAbsence", "==", true), where("clockInDate", "==", todayStr));
        const unsubscribeAbsence = onSnapshot(qAbsence, (snapshot) => {
            if (!isMounted) return;
            const absenceList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const details = absenceList.map(entry => {
                const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                return {
                    id: entry.id,
                    employeeId: entry.employeeId,
                    employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                    areaName: area ? area.name : '---', 
                    workAreaId: entry.workAreaId,
                    clockInTimeFormatted: '-',
                    status: entry.absenceType ? entry.absenceType.toUpperCase() : 'ASSENZA',
                    note: entry.note || entry.absenceType,
                    isAbsence: true 
                };
            });
            setAbsentWorkers(details);
        });

        const qPending = query(collection(db, "time_entries"), where("skipBreakStatus", "==", "pending"));
        const unsubscribePending = onSnapshot(qPending, (snapshot) => { if (!isMounted) return; const pendingDocs = snapshot.docs.map(doc => doc.data()); let count = 0; if (currentUserRole === 'admin') count = pendingDocs.length; else if (currentUserRole === 'preposto') { const managedAreaIds = userData?.managedAreaIds || []; const myPending = pendingDocs.filter(d => managedAreaIds.includes(d.workAreaId)); count = myPending.length; } setPendingRequestsCount(count); });
        
        return () => { isMounted = false; unsubscribeActive(); unsubscribeAbsence(); unsubscribePending(); };
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole, userData, showNotification]);

    useEffect(() => {
        if (!allWorkAreas || allWorkAreas.length === 0 || !allEmployees || allEmployees.length === 0) return;

        let isMounted = true; 
        
        const safeStartOfDay = dayjs().subtract(1, 'day').endOf('day').subtract(2, 'hours').toDate();
        
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(safeStartOfDay)));
        
        const unsubscribe = onSnapshot(q, (snapshot) => { 
            if (!isMounted) return; 
            let totalMinutes = 0; 
            const now = new Date(); 
            const todayStr = dayjs().format('DD/MM/YYYY');
            
            const rawEntries = [];
            const tempDetails = [];

            snapshot.docs.forEach(doc => { 
                const entry = doc.data(); 
                
                if (!entry.clockInTime || entry.isAbsence) return; 
                
                const clockInDateObj = entry.clockInTime.toDate ? entry.clockInTime.toDate() : new Date(entry.clockInTime);
                if (!dayjs(clockInDateObj).isSame(dayjs(), 'day')) return; 
                
                if (currentUserRole === 'preposto') { 
                    const managedAreaIds = userData?.managedAreaIds || []; 
                    if (!entry.workAreaId || !managedAreaIds.includes(entry.workAreaId)) return; 
                } 

                if (dashboardAreaFilter !== 'all' && entry.workAreaId !== dashboardAreaFilter) {
                    return;
                }
                
                rawEntries.push({ id: doc.id, clockInDateObj, ...entry });
            });
            
            const entriesByUser = {};
            rawEntries.forEach(d => {
                if (!entriesByUser[d.employeeId]) entriesByUser[d.employeeId] = [];
                entriesByUser[d.employeeId].push(d);
            });

            const validEntries = [];
            Object.values(entriesByUser).forEach(userEntries => {
                const openEntries = userEntries.filter(e => e.status === 'clocked-in');
                const closedEntries = userEntries.filter(e => e.status !== 'clocked-in');

                closedEntries.forEach(e => validEntries.push(e));

                if (openEntries.length > 0) {
                    openEntries.sort((a, b) => a.clockInDateObj.getTime() - b.clockInDateObj.getTime());
                    validEntries.push(openEntries[0]); 
                }
            });

            validEntries.forEach(entry => { 
                const clockIn = entry.clockInDateObj;
                let clockOut = now;

                if (entry.clockOutTime) {
                    clockOut = entry.clockOutTime.toDate ? entry.clockOutTime.toDate() : new Date(entry.clockOutTime);
                } else if (entry.status !== 'clocked-in') {
                    clockOut = clockIn; 
                }
                
                const totalMs = clockOut.getTime() - clockIn.getTime();
                if (totalMs <= 0) return;

                let recordedPausesMs = 0;
                if (entry.pauses && Array.isArray(entry.pauses)) {
                    entry.pauses.forEach(p => {
                        if (p.start && p.end) {
                            const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                            const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                            recordedPausesMs += (endMillis - startMillis);
                        } else if (p.duration) {
                            recordedPausesMs += (p.duration * 60000);
                        }
                    });
                }

                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                const areaPauseMs = (area?.pauseDuration || 0) * 60000;
                
                let finalPauseMs = 0;
                if (entry.skippedBreak && entry.skipBreakStatus === 'approved') {
                    finalPauseMs = 0;
                } else if (recordedPausesMs > 0) {
                    finalPauseMs = recordedPausesMs;
                } else if (entry.clockOutTime || entry.status === 'clocked-out') {
                    finalPauseMs = areaPauseMs;
                } else {
                    finalPauseMs = 0;
                }
                
                const durationMs = totalMs - finalPauseMs; 
                if (durationMs > 0) {
                    const hrs = durationMs / 3600000;
                    totalMinutes += (durationMs / 60000); 

                    const empObj = allEmployees.find(e => e.id === entry.employeeId);
                    tempDetails.push({
                        id: entry.id,
                        employeeName: empObj ? `${empObj.name} ${empObj.surname}` : 'Sconosciuto',
                        status: entry.status,
                        clockIn: dayjs(clockIn).format('HH:mm'),
                        clockOut: entry.clockOutTime ? dayjs(clockOut).format('HH:mm') : 'In corso',
                        hours: hrs.toFixed(2)
                    });
                }
            }); 
            
            tempDetails.sort((a,b) => a.employeeName.localeCompare(b.employeeName));

            setTodayHoursDetail(tempDetails);
            setTotalDayHours((totalMinutes / 60).toFixed(2)); 
        }, (error) => { 
            if (isMounted) console.error("Errore listener ore totali:", error); 
        });
        
        return () => { isMounted = false; unsubscribe(); };
    }, [currentUserRole, userData, allWorkAreas, dashboardAreaFilter, allEmployees]); 

    const handleArchiveArea = useCallback(async (area) => {
        if (!window.confirm(`Sei sicuro di voler archiviare l'area "${area.name}"?`)) return;
        setIsActionLoading(true);
        try {
            await updateDoc(doc(db, "work_areas", area.id), { isArchived: true });
            showNotification("Area archiviata con successo.", 'success');
            await fetchData();
        } catch (error) { console.error("Errore archiviazione:", error); showNotification("Errore durante l'archiviazione.", 'error'); } finally { setIsActionLoading(false); }
    }, [fetchData, showNotification]);

    const handleRestoreArea = useCallback(async (area) => {
        if (!window.confirm(`Vuoi ripristinare l'area "${area.name}"?`)) return;
        setIsActionLoading(true);
        try {
            await updateDoc(doc(db, "work_areas", area.id), { isArchived: false });
            showNotification("Area ripristinata.", 'success');
            await fetchData();
        } catch (error) { console.error("Errore ripristino:", error); showNotification("Errore durante il ripristino.", 'error'); } finally { setIsActionLoading(false); }
    }, [fetchData, showNotification]);
    
    const handleConfirmProcessExpense = async (paymentMethod, note) => { 
        setIsActionLoading(true); 
        try { 
            const itemsToProcess = isSettlingAll ? bulkExpensesToProcess : [expenseToProcess];

            for (const item of itemsToProcess) {
                await updateDoc(doc(db, "expenses", item.id), { 
                    status: 'paid', 
                    adminPaymentMethod: paymentMethod, 
                    adminNote: note, 
                    closedAt: Timestamp.now(), 
                    closedBy: user.email 
                }); 
            }

            showNotification(isSettlingAll ? "Tutte le spese visibili sono state archiviate!" : "Spesa archiviata!", 'success'); 
            
            setExpenseToProcess(null); 
            setBulkExpensesToProcess([]);
            setIsSettlingAll(false);
            setShowModal(false);

        } catch (error) { 
            console.error("Errore archiviazione spesa:", error); 
            showNotification("Errore durante l'archiviazione.", 'error'); 
        } finally { 
            setIsActionLoading(false); 
        } 
    };
    
    const handleResetEmployeeDevice = useCallback(async (employee) => { if (!employee || !employee.id) return; if (!window.confirm(`Reset dispositivo per ${employee.name}?`)) return; setIsActionLoading(true); try { await updateDoc(doc(db, "employees", employee.id), { deviceIds: [] }); showNotification(`Reset completato.`, 'success'); fetchData(); } catch (error) { showNotification(`Errore reset: ${error.message}`, 'error'); } finally { setIsActionLoading(false); } }, [fetchData, showNotification]);

    const handleDeleteForm = async (formId) => { if (!window.confirm("Eliminare modulo?")) return; try { await deleteDoc(doc(db, "area_forms", formId)); showNotification("Modulo eliminato.", "success"); fetchData(); } catch (error) { showNotification("Errore eliminazione.", "error"); } };

    const handleAdminPause = useCallback(async () => { 
        if (!adminEmployeeProfile) return showNotification("Profilo non trovato.", 'error'); 
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva.", 'error'); 
        
        if (adminActiveEntry.hasCompletedPause) return showNotification("Pausa già completata.", 'info'); 
        
        const workArea = allWorkAreas.find(area => area.id === adminActiveEntry.workAreaId); 
        if (!workArea || !workArea.pauseDuration) return showNotification(`Pausa non configurata per l'area.`, 'info'); 
        
        if (!window.confirm(`Vuoi registrare sùbito la pausa di ${workArea.pauseDuration} minuti?`)) return; 
        
        setIsActionLoading(true); 
        try { 
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee'); 
            const result = await applyPauseFunction({ timeEntryId: adminActiveEntry.id, durationMinutes: workArea.pauseDuration, deviceId: 'ADMIN_MANUAL_ACTION' }); 
            showNotification(result.data.message || "Pausa applicata!", 'success'); 
        } catch (error) { 
            showNotification(`Errore pausa: ${error.message}`, 'error'); 
        } finally { 
            setIsActionLoading(false); 
        } 
    }, [adminActiveEntry, adminEmployeeProfile, allWorkAreas, showNotification]);
    
    const handleEmployeePauseClick = useCallback(async (employee) => { const timeEntryId = employee?.activeEntry?.id; if (!timeEntryId) return showNotification("Timbratura attiva non trovata.", 'error'); const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId); if (!workArea || !workArea.pauseDuration) return showNotification(`Pausa non configurata per l'area.`, 'info'); if (employee.activeEntry.hasCompletedPause) return showNotification(`Pausa già eseguita.`, 'info'); if (!window.confirm(`Inserire pausa per ${employee.name}?`)) return; setIsActionLoading(true); try { const now = new Date(); const startPause = new Date(now.getTime() - (workArea.pauseDuration * 60000)); const entryRef = doc(db, "time_entries", timeEntryId); await updateDoc(entryRef, { pauses: arrayUnion({ start: Timestamp.fromDate(startPause), end: Timestamp.fromDate(now), type: 'manual_forced', addedBy: user.email }) }); showNotification("Pausa inserita!", 'success'); } catch (error) { showNotification(`Errore: ${error.message}`, 'error'); } finally { setIsActionLoading(false); } }, [allWorkAreas, user, showNotification]);
    
    const openModal = useCallback((type, item = null) => { 
        if (type === 'prepostoAddEmployeeToAreas') { setShowAddEmployeeModal(true); return; } 
        if (type === 'newForm') { setShowAddFormModal(true); return; }
        if (type === 'addExpense') { setShowAddExpenseModal(true); return; }
        setModalType(type); setSelectedItem(item); setShowModal(true); 
    }, []);

    const generateReport = useCallback(async () => { 
        if (!dateRange.start || !dateRange.end) return; 
        setIsLoading(true); 
        try { 
            const functions = getFunctions(undefined, 'europe-west1'); 
            const generateReportFunction = httpsCallable(functions, 'generateTimeReport'); 
            const result = await generateReportFunction({ startDate: dateRange.start, endDate: dateRange.end, employeeIdFilter: reportEmployeeFilter, areaIdFilter: reportAreaFilter }); 
            let fetchedEntries = result.data.reports; 
            
            if (currentUserRole === 'preposto') { 
                const managedIds = userData?.managedAreaIds || []; 
                fetchedEntries = fetchedEntries.filter(entry => entry.isAbsence || managedIds.includes(entry.workAreaId)); 
            } 
            
            const areaHoursMap = new Map(allWorkAreas.map(area => [area.id, 0])); 
            
            const formatTime = (date, time) => { 
                const finalTime = time === 'In corso' ? '99:99' : time; 
                const formattedDate = date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'); 
                return new Date(`${formattedDate} ${finalTime}`); 
            }; 
            
            const reportData = fetchedEntries.map(entry => { 
                const clockIn = entry.clockInTime ? new Date(entry.clockInTime) : null; 
                const clockOut = entry.clockOutTime ? new Date(entry.clockOutTime) : null; 
                
                if (!clockIn) return null; 
                
                const employee = allEmployees.find(e => e.id === entry.employeeId); 
                const area = allWorkAreas.find(a => a.id === entry.workAreaId); 
                
                if (!employee) return null; 
                
                let durationHours = null; 
                let pauseHours = 0; 
                
                if (entry.isAbsence) { 
                    return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: "---", clockInDate: clockIn.toLocaleDateString('it-IT'), clockInTimeFormatted: "-", clockOutTimeFormatted: "-", duration: 0, pauseHours: 0, note: entry.note || entry.absenceType, statusLabel: entry.absenceType ? entry.absenceType.toUpperCase() : "ASSENZA", isAbsence: true, workAreaId: null }; 
                } 
                
                if (clockOut) { 
                    const totalMs = clockOut.getTime() - clockIn.getTime(); 
                    
                    const recordedPausesMs = (entry.pauses || []).reduce((acc, p) => { 
                        if (p.start && p.end) return acc + (new Date(p.end).getTime() - new Date(p.start).getTime()); 
                        return acc; 
                    }, 0); 
                    
                    const areaPauseMs = (area?.pauseDuration || 0) * 60000; 
                    
                    let finalPauseMs = 0;
                    if (entry.skippedBreak && entry.skipBreakStatus === 'approved') {
                        finalPauseMs = 0;
                    } else if (recordedPausesMs > 0) {
                        finalPauseMs = recordedPausesMs; 
                    } else {
                        finalPauseMs = areaPauseMs; 
                    }
                    
                    pauseHours = finalPauseMs / 3600000; 
                    durationHours = Math.max(0, (totalMs - finalPauseMs) / 3600000); 
                    
                    if (area) areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours); 
                } 
                
                return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: area?.name || '---', clockInDate: clockIn.toLocaleDateString('it-IT'), clockInTimeFormatted: clockIn.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), clockOutTimeFormatted: clockOut ? clockOut.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '---', duration: durationHours, pauseHours, note: entry.note || '', skippedBreak: entry.skippedBreak, skipBreakStatus: entry.skipBreakStatus, workAreaId: entry.workAreaId }; 
            }).filter(Boolean).sort((a, b) => { 
                const dateA = formatTime(a.clockInDate, a.clockInTimeFormatted); 
                const dateB = formatTime(b.clockInDate, b.clockOutTimeFormatted); 
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) { 
                    if (a.clockInDate !== b.clockInDate) return a.clockInDate.localeCompare(b.clockInDate); 
                    return a.employeeName.localeCompare(b.employeeName); 
                } 
                if (dateA < dateB) return -1; 
                if (dateA > dateB) return 1; 
                return a.employeeName.localeCompare(b.employeeName); 
            }); 
            
            setReports(reportData); 
            setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`); 
            setWorkAreasWithHours(allWorkAreas.map(a => ({ ...a, totalHours: (areaHoursMap.get(a.id) || 0).toFixed(2) }))); 
            
            if(reportData.length > 0) setView('reports'); 
            
        } catch (error) { 
            showNotification(`Errore: ${error.message}`, 'error'); 
        } finally { 
            setIsLoading(false); 
        } 
    }, [dateRange, reportAreaFilter, reportEmployeeFilter, allEmployees, allWorkAreas, showNotification, currentUserRole, userData]); 

    const handleReviewSkipBreak = useCallback(async (entryId, decision) => { if (!entryId || !decision) return; if (!window.confirm("Confermare revisione pausa?")) return; setIsActionLoading(true); try { const functions = getFunctions(undefined, 'europe-west1'); const reviewFunction = httpsCallable(functions, 'reviewSkipBreakRequest'); await reviewFunction({ timeEntryId: entryId, decision, adminId: user.uid }); showNotification(`Richiesta aggiornata!`, 'success'); generateReport(); } catch (error) { showNotification("Errore revisione.", 'error'); } finally { setIsActionLoading(false); } }, [user, showNotification, generateReport]);
    
    // --- FUNZIONE CORRETTA: ORA SALVA VERAMENTE LA RIMOZIONE PAUSA ---
    const handleSaveEntryEdit = async (entryId, updatedData) => { 
        setIsActionLoading(true); 
        try { 
            const entryRef = doc(db, "time_entries", entryId); 
            
            const updatePayload = { 
                workAreaId: updatedData.workAreaId, 
                note: updatedData.note, 
                clockInTime: Timestamp.fromDate(new Date(`${updatedData.date}T${updatedData.clockInTime}:00`)),
                skippedBreak: updatedData.skippedBreak // <-- SALVA LA SPUNTA!
            }; 
            
            // Approva automaticamente se è l'admin a spuntare
            if (updatedData.skippedBreak) {
                updatePayload.skipBreakStatus = 'approved';
            } else {
                updatePayload.skipBreakStatus = 'none';
            }
            
            if (updatedData.clockOutTime && updatedData.clockOutTime.includes(':') && updatedData.clockOutTime.trim() !== '') { 
                updatePayload.clockOutTime = Timestamp.fromDate(new Date(`${updatedData.date}T${updatedData.clockOutTime}:00`)); 
                updatePayload.status = 'clocked-out'; 
            } 
            
            await updateDoc(entryRef, updatePayload); 
            showNotification("Aggiornato!", "success"); 
            setEntryToEdit(null); 
            generateReport(); 
        } catch (error) { 
            showNotification("Errore: " + error.message, "error"); 
        } finally { 
            setIsActionLoading(false); 
        } 
    };

    const handleExportXml = useCallback((data) => { let xml = '<?xml version="1.0"?><Report>'; data.forEach(e => xml += `<Timbratura><Dip>${e.employeeName}</Dip><Area>${e.areaName}</Area><Data>${e.clockInDate}</Data><Ore>${e.duration?.toFixed(2)}</Ore></Timbratura>`); xml += '</Report>'; const blob = new Blob([xml], { type: "application/xml" }); saveAs(blob, `Report.xml`); }, []);
    const requestSort = useCallback((key) => { setSortConfig(p => ({ key, direction: p.key === key && p.direction === 'ascending' ? 'descending' : 'ascending' })); }, []);
    
    if (isLoading || !user || !userData) return <div className="modern-bg" style={{display: 'flex', alignItems:'center', justifyContent: 'center'}}><span style={{ fontSize: '16px', fontWeight: 'bold', color: '#64748b' }}>Caricamento Dati in corso...</span></div>;
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') return <div className="modern-bg" style={{display: 'flex', alignItems:'center', justifyContent: 'center'}}><span style={{ fontSize: '18px', fontWeight: 'bold', color: '#EF4444' }}>Accesso non autorizzato.</span></div>; 

    const activeExpensesCount = expenses.filter(e => e.status !== 'closed' && e.status !== 'paid').length;

    return (
        <div className="modern-bg">
            <ModernStyles />
            {notification && <NotificationPopup message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <header className="modern-header">
                 <div className="header-left"></div>

                 <div className="header-center">
                     <CompanyLogo />
                 </div>

                 <div className="header-right">
                     <div style={{textAlign: 'right'}}>
                         <div style={{fontSize: '14px', fontWeight: '800', color: '#0f172a'}}>{userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}</div>
                         <div style={{fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px'}}>{currentUserRole === 'admin' ? 'Amministratore' : 'Preposto'}</div>
                     </div>
                     <button onClick={handleLogout} className="modern-btn-outline" style={{color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', padding: '8px 16px', width: window.innerWidth <= 768 ? '100%' : 'auto'}}>
                         🚪 Esci
                     </button>
                 </div>
            </header>

            <nav className="modern-nav">
                 <button onClick={() => handleSwitchView('dashboard')} className={`modern-tab ${view === 'dashboard' ? 'active' : ''}`}>🏠 Dashboard</button>
                 <button onClick={() => handleSwitchView('employees')} className={`modern-tab ${view === 'employees' ? 'active' : ''}`}>👥 Personale</button>
                 <button onClick={() => handleSwitchView('areas')} className={`modern-tab ${view === 'areas' ? 'active' : ''}`}>📍 Cantieri</button>
                 {currentUserRole === 'admin' && <button onClick={() => handleSwitchView('admins')} className={`modern-tab ${view === 'admins' ? 'active' : ''}`}>👮 Utenti</button>}
                 {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (<button onClick={() => handleSwitchView('expenses')} className={`modern-tab ${view === 'expenses' ? 'active' : ''}`}>💰 Rimborsi {activeExpensesCount > 0 && (<span className="modern-badge red" style={{padding: '2px 6px', fontSize: '10px'}}>{activeExpensesCount}</span>)}</button>)}
                 {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (<button onClick={() => handleSwitchView('reports')} className={`modern-tab ${view === 'reports' ? 'active' : ''}`}>📋 Report Ore {pendingRequestsCount > 0 && (<span className="modern-badge orange" style={{padding: '2px 6px', fontSize: '10px'}}>{pendingRequestsCount}</span>)}</button>)}
            </nav>

            <div style={{maxWidth: '1200px', margin: '0 auto', padding: '0 10px'}}>
                <main>
                    {view === 'dashboard' && (
                        <DashboardView 
                            totalEmployees={dashboardTotalEmployees} 
                            activeEmployeesDetails={activeEmployeesDetails} 
                            totalDayHours={totalDayHours} 
                            workAreas={activeVisibleWorkAreas} 
                            adminEmployeeProfile={adminEmployeeProfile} 
                            adminActiveEntry={adminActiveEntry} 
                            handleAdminPause={handleAdminPause} 
                            openModal={openModal} 
                            isActionLoading={isActionLoading} 
                            dashboardAreaFilter={dashboardAreaFilter}
                            setDashboardAreaFilter={setDashboardAreaFilter}
                            todayHoursDetail={todayHoursDetail}
                        />
                    )}
                    {view === 'expenses' && (
                        <div className="modern-card">
                            <div className="modern-title">
                                <div>💰 Gestione Rimborsi Spese</div>
                                <div className="title-actions">
                                    <button onClick={() => openModal('addExpense')} className="modern-btn">➕ Registra Spesa</button>
                                    <button onClick={() => setShowArchived(!showArchived)} className="modern-btn-outline">{showArchived ? '📂 Torna alle Attive' : '📂 Archivio Storico'}</button>
                                </div>
                            </div>
                            <input type="text" placeholder="🔍 Cerca Dipendente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="modern-input" style={{marginBottom: '20px'}}/>
                            <ExpensesView 
                                expenses={expenses} 
                                onProcessExpense={(exp) => { setExpenseToProcess(exp); openModal('processExpense'); }} 
                                onBulkProcessExpense={(list) => { setBulkExpensesToProcess(list); setIsSettlingAll(true); openModal('processExpense'); }}
                                onEditExpense={(exp) => { setExpenseToEdit(exp); openModal('editExpense'); }} 
                                currentUserRole={currentUserRole} 
                                user={user} 
                                searchTerm={searchTerm} 
                                showArchived={showArchived}
                            />
                        </div>
                    )}
                    {view === 'employees' && (
                        <div className="modern-card">
                            <div className="modern-title">
                                <div>👥 Gestione Personale Operativo</div>
                                <div className="title-actions">
                                    {currentUserRole === 'admin' ? <button onClick={() => openModal('newEmployee')} className="modern-btn">➕ Crea Dipendente</button> : <button onClick={() => openModal('prepostoAddEmployeeToAreas')} className="modern-btn">➕ Aggiungi a Mie Aree</button>}
                                    <button onClick={() => setShowArchived(!showArchived)} className="modern-btn-outline">{showArchived ? '📂 Nascondi Archiviati' : '📂 Mostra Archiviati'}</button>
                                </div>
                            </div>
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="🔍 Cerca nome dipendente..." className="modern-input" style={{marginBottom: '20px'}} />
                            <EmployeeManagementView employees={sortedAndFilteredEmployees} openModal={openModal} currentUserRole={currentUserRole} requestSort={requestSort} sortConfig={sortConfig} handleResetEmployeeDevice={handleResetEmployeeDevice} adminEmployeeId={adminEmployeeProfile?.id} handleEmployeePauseClick={handleEmployeePauseClick} showArchived={showArchived} />
                        </div>
                    )}
                    {view === 'areas' && (
                        <div className="modern-card">
                            <div className="modern-title">
                                <div>📍 Gestione Cantieri (Aree di Lavoro)</div>
                                <div className="title-actions">
                                    {currentUserRole === 'admin' && <button onClick={() => openModal('newArea')} className="modern-btn">➕ Crea Cantiere</button>}
                                </div>
                            </div>
                            <AreaManagementView workAreas={visibleWorkAreas} openModal={openModal} currentUserRole={currentUserRole} handleArchiveArea={handleArchiveArea} handleRestoreArea={handleRestoreArea} searchTerm={searchTerm} />
                        </div>
                    )}
                    {view === 'admins' && currentUserRole === 'admin' && (
                        <div className="modern-card">
                            <div className="modern-title">
                                <div>👮 Utenti di Sistema (Admin/Preposti)</div>
                                <div className="title-actions">
                                    <button onClick={() => openModal('newAdmin')} className="modern-btn">➕ Crea Nuovo Utente</button>
                                </div>
                            </div>
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="🔍 Cerca Utente..." className="modern-input" style={{marginBottom: '20px'}} />
                            <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} searchTerm={searchTerm} />
                        </div>
                    )}
                    {view === 'reports' && (
                        <>
                            <div className="modern-card">
                                <div className="modern-title">Generazione Estrazioni Ore</div>
                                <div className="filters-grid">
                                    <div><label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'#64748b', marginBottom:'6px'}}>Da Data</label><input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="modern-input" /></div>
                                    <div><label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'#64748b', marginBottom:'6px'}}>A Data</label><input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="modern-input" /></div>
                                    <div><label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'#64748b', marginBottom:'6px'}}>Cantiere</label><select value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="modern-input"><option value="all">Tutti i Cantieri</option>{(currentUserRole === 'admin' ? activeWorkAreas : activeWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))).sort((a,b) => a.name.localeCompare(b.name)).map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                                    <div><label style={{display:'block', fontSize:'11px', fontWeight:'700', color:'#64748b', marginBottom:'6px'}}>Dipendente</label><select value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="modern-input"><option value="all">Tutti i Dipendenti</option>{(currentUserRole === 'admin' ? allEmployees : managedEmployees).sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}</select></div>
                                    <button onClick={generateReport} disabled={isLoading || isActionLoading} className="modern-btn" style={{height: '42px'}}>📄 Genera Report</button>
                                </div>
                            </div>
                            <ReportView reports={reports} title={reportTitle} handleExportXml={handleExportXml} dateRange={dateRange} allWorkAreas={activeWorkAreas} allEmployees={allEmployees} currentUserRole={currentUserRole} userData={userData} setDateRange={setDateRange} setReportAreaFilter={setReportAreaFilter} reportAreaFilter={reportAreaFilter} reportEmployeeFilter={reportEmployeeFilter} setReportEmployeeFilter={setReportEmployeeFilter} generateReport={generateReport} isLoading={isLoading} isActionLoading={isActionLoading} managedEmployees={managedEmployees} showNotification={showNotification} handleReviewSkipBreak={handleReviewSkipBreak} onEditEntry={(entry) => { setEntryToEdit(entry); openModal('editTimeEntry'); }} handleSaveEntryEdit={handleSaveEntryEdit} />
                        </>
                    )}
                </main>
            </div>
            
            <footer style={{textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '12px', fontWeight: '600'}}>
                 <div style={{marginBottom: '5px'}}>Created by D. Leoncino</div>
                 &copy; {new Date().getFullYear()} TCS ITALIA S.R.L. - Sistema Gestionale Integrato
            </footer>

            {/* --- I MODALI --- */}
            {/* ORA SONO TUTTI REGOLARMENTE MONTATI */}
            {showAddEmployeeModal && (
                <AddEmployeeToAreaModal 
                    show={showAddEmployeeModal} 
                    onClose={() => setShowAddEmployeeModal(false)} 
                    allEmployees={allEmployees} 
                    workAreas={activeVisibleWorkAreas} 
                    userData={userData} 
                    showNotification={showNotification} 
                    onDataUpdate={fetchData} 
                />
            )}
            
            {showAddFormModal && (
                <AddFormModal 
                    show={showAddFormModal} 
                    onClose={() => setShowAddFormModal(false)} 
                    workAreas={activeVisibleWorkAreas} 
                    user={user} 
                    onDataUpdate={fetchData} 
                    currentUserRole={currentUserRole} 
                    userData={userData} 
                    showNotification={showNotification} 
                />
            )}

            {showModal && modalType === 'editTimeEntry' && entryToEdit && ( <EditTimeEntryModal entry={entryToEdit} workAreas={activeVisibleWorkAreas} onClose={() => { setShowModal(false); setEntryToEdit(null); }} onSave={handleSaveEntryEdit} isLoading={isActionLoading} /> )}
            {showModal && modalType === 'addExpense' && ( <AddExpenseModal show={true} onClose={() => setShowModal(false)} user={user} userData={userData} showNotification={showNotification} /> )}
            {showModal && modalType === 'editExpense' && expenseToEdit && ( <AddExpenseModal show={true} onClose={() => { setShowModal(false); setExpenseToEdit(null); }} user={user} userData={userData} showNotification={showNotification} expenseToEdit={expenseToEdit} /> )}
            
            {showModal && modalType === 'processExpense' && (expenseToProcess || isSettlingAll) && ( 
                <ProcessExpenseModal 
                    show={true} 
                    onClose={() => { setShowModal(false); setExpenseToProcess(null); setIsSettlingAll(false); setBulkExpensesToProcess([]); }} 
                    expense={expenseToProcess} 
                    isBulk={isSettlingAll}
                    bulkExpenses={bulkExpensesToProcess}
                    onConfirm={handleConfirmProcessExpense} 
                    isProcessing={isActionLoading} 
                /> 
            )}
            
            {showModal && !['editTimeEntry', 'addExpense', 'editExpense', 'processExpense'].includes(modalType) && ( <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} setModalType={setModalType} workAreas={activeVisibleWorkAreas} onDataUpdate={fetchData} user={user} superAdminEmail={superAdminEmail} allEmployees={allEmployees} currentUserRole={currentUserRole} userData={userData} activeEmployeesDetails={activeEmployeesDetails} onAdminApplyPause={handleEmployeePauseClick} showNotification={showNotification} /> )}
        </div>
    );
};

export default AdminDashboard;