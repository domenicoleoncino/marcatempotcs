/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { db, storage } from '../firebase'; // Assicurati che storage sia esportato in firebase.js
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

// ===========================================
// --- 1. NOTIFICHE E VARIABILI GLOBALI ---
// ===========================================

const SUPER_ADMIN_EMAIL = "domenico.leoncino@tcsitalia.com"; 

// --- CONFIGURAZIONE LIMITI ---
const MAX_DEVICE_LIMIT = 2; 

// Palette colori per Excel (Aree)
const AREA_COLORS = [
    "FFCCCC", "CCFFCC", "CCCCFF", "FFFFCC", "FFCCFF", 
    "CCFFFF", "FFD9CC", "E5CCFF", "D9FFCC", "FFE5CC"
];

const NotificationPopup = ({ message, type, onClose }) => {
    const baseClasses = "fixed top-4 left-1/2 transform -translate-x-1/2 z-[100000] px-6 py-4 rounded-xl shadow-2xl text-white transition-all duration-300 flex items-center gap-3 min-w-[300px]";
    const typeClasses = {
        success: "bg-gradient-to-r from-green-600 to-green-500 border border-green-400",
        error: "bg-gradient-to-r from-red-600 to-red-500 border border-red-400",
        info: "bg-gradient-to-r from-blue-600 to-blue-500 border border-blue-400"
    };

    return (
        <div className={`${baseClasses} ${typeClasses[type]}`}>
            <div className="flex-1">
                <p className="font-bold text-sm uppercase tracking-wider opacity-90">{type === 'error' ? 'Attenzione' : 'Avviso'}</p>
                <p className="font-medium text-base">{message}</p>
            </div>
            <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors font-bold text-xl leading-none">&times;</button>
        </div>
    );
};

// ===========================================
// --- 2. SOTTO-COMPONENTI (MODALE & VISTE) ---
// ===========================================

// --- MODALE PER AGGIUNGERE NUOVA SPESA (MANCANTE NEL CODICE PRECEDENTE) ---
const AddExpenseModal = ({ show, onClose, user, userData, showNotification, expenseToEdit }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [note, setNote] = useState('');
    const [file, setFile] = useState(null); 
    const [isSaving, setIsSaving] = useState(false);

    // Effetto per popolare il form se siamo in modalità modifica
    useEffect(() => {
        if (expenseToEdit) {
            setAmount(expenseToEdit.amount);
            setDescription(expenseToEdit.description);
            if (expenseToEdit.date && expenseToEdit.date.toDate) {
                setDate(expenseToEdit.date.toDate().toISOString().split('T')[0]);
            } else if (expenseToEdit.date) {
                 setDate(new Date(expenseToEdit.date).toISOString().split('T')[0]);
            }
            setNote(expenseToEdit.note || '');
            setFile(null); 
        } else {
            setAmount(''); setDescription(''); setNote(''); setFile(null); 
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [expenseToEdit, show]);

    if (!show) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!amount || !description || !date) { 
            alert("Importo, descrizione e data sono obbligatori."); 
            return; 
        }

        setIsSaving(true);
        try {
            let receiptUrl = expenseToEdit ? expenseToEdit.receiptUrl : null;

            if (file) {
                if (!storage) throw new Error("Firebase Storage non è inizializzato.");
                const fileRef = ref(storage, `expenses/${user.uid}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(fileRef, file);
                receiptUrl = await getDownloadURL(snapshot.ref);
            }

            const expenseData = {
                amount: parseFloat(amount),
                description: description,
                note: note,
                date: Timestamp.fromDate(new Date(date)),
                userId: expenseToEdit ? expenseToEdit.userId : user.uid,
                userName: expenseToEdit ? expenseToEdit.userName : (userData?.name ? `${userData.name} ${userData.surname}` : user.email),
                userRole: expenseToEdit ? expenseToEdit.userRole : (userData?.role || 'unknown'),
                receiptUrl: receiptUrl, 
                status: expenseToEdit ? expenseToEdit.status : 'pending',
                updatedAt: Timestamp.now()
            };

            if (expenseToEdit) {
                await updateDoc(doc(db, "expenses", expenseToEdit.id), expenseData);
                showNotification("Spesa aggiornata con successo!", "success");
            } else {
                expenseData.createdAt = Timestamp.now();
                await addDoc(collection(db, "expenses"), expenseData);
                showNotification("Spesa registrata con successo!", "success");
            }

            setAmount(''); setDescription(''); setNote(''); setFile(null); 
            setDate(new Date().toISOString().split('T')[0]);
            onClose();
        } catch (error) {
            console.error("Errore salvataggio spesa:", error);
            showNotification("Errore: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";
    const labelClasses = "block mb-1 text-xs font-bold text-gray-500 uppercase tracking-wide";

    return ReactDOM.createPortal(
        <>
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#047857' }}>{expenseToEdit ? '✏️ Modifica Spesa' : '💰 Registra Nuova Spesa'}</h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#047857' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <form id="add-expense-form" onSubmit={handleSave} className="space-y-4">
                            <div><label className={labelClasses}>Data Spesa</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClasses} required /></div>
                            <div>
                                <label className={labelClasses}>Importo (€)</label>
                                <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClasses} required />
                            </div>
                            <div>
                                <label className={labelClasses}>Descrizione</label>
                                <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Es. Carburante, Pranzo..." className={inputClasses} required />
                            </div>
                            <div>
                                <label className={labelClasses}>
                                    {expenseToEdit && expenseToEdit.receiptUrl ? 'Cambia File (Opzionale)' : 'Allegato (Foto/File) - Opzionale'}
                                </label>
                                <input 
                                    type="file" 
                                    onChange={e => setFile(e.target.files[0])} 
                                    accept="image/*,.pdf"
                                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                                />
                                {expenseToEdit && expenseToEdit.receiptUrl && !file && <p style={{fontSize:'0.7rem', color:'green', marginTop:'5px'}}>📎 File attuale presente</p>}
                            </div>
                            <div>
                                <label className={labelClasses}>Note (Opzionale)</label>
                                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Dettagli aggiuntivi..." className={`${inputClasses} resize-y min-h-[80px]`} />
                            </div>
                        </form>
                    </div>
                    <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100 text-sm font-semibold">Annulla</button>
                        <button type="submit" form="add-expense-form" disabled={isSaving} className="px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50 text-sm">{isSaving ? 'Caricamento...' : 'Conferma'}</button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

// --- MODALE PER GESTIRE/SALDARE LA SPESA (ADMIN) ---
const ProcessExpenseModal = ({ show, onClose, expense, onConfirm, isProcessing }) => {
    const [adminPaymentMethod, setAdminPaymentMethod] = useState('Rimborso in Busta Paga');
    const [adminNote, setAdminNote] = useState('');

    if (!show || !expense) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(expense.id, adminPaymentMethod, adminNote);
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";

    return ReactDOM.createPortal(
        <>
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#166534' }}>✅ Chiudi e Archivia Spesa</h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#166534' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
                            <p><strong>Dipendente:</strong> {expense.userName}</p>
                            <p><strong>Importo:</strong> € {parseFloat(expense.amount).toFixed(2)}</p>
                            <p><strong>Pagato con:</strong> {expense.paymentMethod || 'N/D'}</p>
                        </div>
                        <form id="process-expense-form" onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Come hai rimborsato/chiuso questa spesa?</label>
                                <select value={adminPaymentMethod} onChange={e => setAdminPaymentMethod(e.target.value)} className={inputClasses}>
                                    <option value="Rimborso in Busta Paga">Rimborso in Busta Paga</option>
                                    <option value="Bonifico Effettuato">Bonifico Effettuato</option>
                                    <option value="Rimborso Cassa (Contanti)">Rimborso Cassa (Contanti)</option>
                                    <option value="Nessun Rimborso (Carta Aziendale)">Nessun Rimborso (Carta Aziendale)</option>
                                    <option value="Non Rimborsabile (Rifiutata)">Non Rimborsabile (Rifiutata)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Note Amministratore</label>
                                <textarea 
                                    value={adminNote} 
                                    onChange={e => setAdminNote(e.target.value)} 
                                    placeholder="Es. Inserito nella busta di Marzo..." 
                                    className={`${inputClasses} resize-y min-h-[80px]`} 
                                />
                            </div>
                        </form>
                    </div>
                    <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100 text-sm">Annulla</button>
                        <button type="submit" form="process-expense-form" disabled={isProcessing} className="px-4 py-2 bg-green-600 text-white rounded font-bold">{isProcessing ? '...' : 'Conferma'}</button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

const EditTimeEntryModal = ({ entry, workAreas, onClose, onSave, isLoading }) => {
    const formatDateForInput = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('/'); 
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; 
        return dateStr;
    };

    const [skipPause, setSkipPause] = useState(!!entry.skippedBreak);
    const [formData, setFormData] = useState({
        workAreaId: entry.workAreaId || '',
        note: entry.note || '',
        date: formatDateForInput(entry.clockInDate), 
        clockInTime: entry.clockInTimeFormatted || '08:00',
        clockOutTime: entry.clockOutTimeFormatted !== 'In corso' ? entry.clockOutTimeFormatted : ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (skipPause && (!formData.note || formData.note.trim() === '')) {
            alert("ATTENZIONE: Se indichi che il dipendente NON ha effettuato la pausa, è OBBLIGATORIO inserire il motivo nelle note.");
            return;
        }
        onSave(entry.id, { ...formData, skippedBreak: skipPause });
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', maxHeight: '85vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";
    const labelClasses = "block mb-1 text-xs font-bold text-gray-500 uppercase tracking-wide";

    return ReactDOM.createPortal(
        <>
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>✏️Modifica Timbratura</h3>
                            <div style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
                                Dipendente: <span style={{ fontWeight: 'bold', color: '#374151' }}>{entry.employeeName || 'N/D'}</span>
                            </div>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px', overflowY: 'auto' }}>
                        <form id="edit-entry-form" onSubmit={handleSubmit} className="space-y-5">
                            <div><label className={labelClasses}>Data</label><input type="date" name="date" value={formData.date} onChange={handleChange} required className={inputClasses} /></div>
                            {!entry.isAbsence && (
                                <div><label className={labelClasses}>Area di Lavoro</label><select name="workAreaId" value={formData.workAreaId} onChange={handleChange} className={inputClasses}>{workAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                            )}
                            {!entry.isAbsence && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className={labelClasses}>Ora Entrata</label><input type="time" name="clockInTime" value={formData.clockInTime} onChange={handleChange} className={inputClasses} required /></div>
                                    <div><label className={labelClasses}>Ora Uscita</label><input type="time" name="clockOutTime" value={formData.clockOutTime} onChange={handleChange} className={inputClasses} /><p className="text-[10px] text-gray-400 mt-1 text-right italic">Lascia vuoto se in corso</p></div>
                                </div>
                            )}
                            {!entry.isAbsence && (
                                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                    <div className="flex items-center"><input id="skipPauseCheck" type="checkbox" checked={skipPause} onChange={(e) => setSkipPause(e.target.checked)} className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer" /><label htmlFor="skipPauseCheck" className="ml-3 block text-sm font-bold text-gray-800 cursor-pointer">Non ha effettuato la pausa</label></div>
                                    <p className="text-xs text-gray-600 mt-2 ml-8 leading-snug">Se selezionato, le ore verranno calcolate per intero. <strong>Motivo obbligatorio.</strong></p>
                                </div>
                            )}
                            <div><label className={labelClasses}>Note / Motivo  {skipPause && <span className="text-red-600">*</span>}</label><textarea name="note" value={formData.note} onChange={handleChange} placeholder={skipPause ? "Inserire OBBLIGATORIAMENTE il motivo..." : "Opzionale"} className={`${inputClasses} resize-y min-h-[80px] ${skipPause && !formData.note ? 'border-red-500 ring-1 ring-red-500 bg-red-50' : ''}`} ></textarea></div>
                        </form>
                    </div>
                    <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors text-sm shadow-sm">Annulla</button>
                        <button type="submit" form="edit-entry-form" disabled={isLoading} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors text-sm shadow-md disabled:opacity-70 disabled:cursor-not-allowed">{isLoading ? 'Salvataggio...' : 'Salva Modifiche'}</button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

// --- NUOVO MODALE SICURO PER PREPOSTI ---
const AddEmployeeToAreaModal = ({ show, onClose, allEmployees, workAreas, userData, showNotification, onDataUpdate }) => {
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [selectedAreaId, setSelectedAreaId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const myAreas = useMemo(() => {
        if (!userData || !userData.managedAreaIds) return [];
        return workAreas.filter(a => userData.managedAreaIds.includes(a.id));
    }, [workAreas, userData]);

    const sortedEmployees = useMemo(() => {
        // Mostra solo dipendenti NON cancellati nella ricerca
        return [...allEmployees].filter(e => !e.isDeleted).sort((a, b) => {
            const nameA = `${a.surname} ${a.name}`.toLowerCase();
            const nameB = `${b.surname} ${b.name}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [allEmployees]);

    if (!show) return null;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!selectedEmpId || !selectedAreaId) { 
            alert("Seleziona sia il dipendente che l'area."); 
            return; 
        }
        
        setIsSaving(true);
        try {
            const employeeRef = doc(db, "employees", selectedEmpId);
            await updateDoc(employeeRef, {
                workAreaIds: arrayUnion(selectedAreaId)
            });
            showNotification("Dipendente collegato correttamente alla squadra!", "success");
            await onDataUpdate(); 
            onClose();
            setSelectedEmpId('');
            setSelectedAreaId('');
        } catch (error) {
            console.error("Errore assegnazione:", error);
            showNotification("Errore: " + error.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";
    const labelClasses = "block mb-1 text-xs font-bold text-gray-500 uppercase tracking-wide";

    return ReactDOM.createPortal(
        <>
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f9ff' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0369a1' }}>👥 Aggiungi alla Squadra</h3>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer', color: '#0369a1' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px' }}>
                        <form id="add-emp-form" onSubmit={handleSave} className="space-y-5">
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-4">
                                <p className="text-sm text-blue-800">
                                    ℹ️ Cerca nella lista. <br/>
                                </p>
                            </div>
                            <div>
                                <label className={labelClasses}>1. Chi vuoi aggiungere?</label>
                                <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} className={inputClasses} required>
                                    <option value="">-- Cerca Cognome Nome --</option>
                                    {sortedEmployees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.surname} {emp.name} ({emp.email})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClasses}>2. In quale area lavorerà?</label>
                                <select value={selectedAreaId} onChange={e => setSelectedAreaId(e.target.value)} className={inputClasses} required>
                                    <option value="">-- Seleziona Area --</option>
                                    {myAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}
                                </select>
                            </div>
                        </form>
                    </div>
                    <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">Annulla</button>
                        <button type="submit" form="add-emp-form" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 disabled:opacity-50">{isSaving ? 'Salvataggio...' : 'Conferma Aggiunta'}</button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

const AddFormModal = ({ show, onClose, workAreas, user, onDataUpdate, currentUserRole, userData, showNotification }) => {
    const [formTitle, setFormTitle] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formAreaId, setFormAreaId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const availableAreas = useMemo(() => {
        if (currentUserRole === 'admin') return workAreas;
        if (currentUserRole === 'preposto' && userData?.managedAreaIds) {
            return workAreas.filter(a => userData.managedAreaIds.includes(a.id));
        }
        return [];
    }, [currentUserRole, userData, workAreas]);

    if (!show) return null;

    const handleSaveForm = async (e) => {
        e.preventDefault();
        if (!formTitle || !formUrl || !formAreaId) { alert("Tutti i campi sono obbligatori."); return; }
        setIsSaving(true);
        try {
            await addDoc(collection(db, "area_forms"), {
                title: formTitle,
                url: formUrl,
                workAreaId: formAreaId,
                createdBy: user.email,
                createdAt: Timestamp.now()
            });
            showNotification("Modulo creato e assegnato con successo!", "success");
            onDataUpdate();
            onClose();
            setFormTitle(''); setFormUrl(''); setFormAreaId('');
        } catch (error) {
            console.error("Errore salvataggio modulo:", error);
            showNotification("Errore salvataggio modulo.", "error");
        } finally { setIsSaving(false); }
    };

    const overlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 99998, backdropFilter: 'blur(4px)' };
    const containerStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' };
    const modalStyle = { backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', maxHeight: '85vh', borderRadius: '12px', overflow: 'hidden', pointerEvents: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column' };
    const inputClasses = "block w-full px-3 py-2.5 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm";
    const labelClasses = "block mb-1 text-xs font-bold text-gray-500 uppercase tracking-wide";

    return ReactDOM.createPortal(
        <>
            <div style={overlayStyle} onClick={onClose} />
            <div style={containerStyle}>
                <div style={modalStyle}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>🔗 Aggiungi Modulo Forms</h3>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer', lineHeight: '1' }}>&times;</button>
                    </div>
                    <div style={{ padding: '24px', overflowY: 'auto' }}>
                        <form id="add-form-submit" onSubmit={handleSaveForm} className="space-y-5">
                            <div><label className={labelClasses}>Titolo Modulo</label><input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Es. Checklist Sicurezza" className={inputClasses} required /></div>
                            <div><label className={labelClasses}>Link Microsoft Forms (URL)</label><input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://forms.office.com/..." className={inputClasses} required /></div>
                            <div><label className={labelClasses}>Assegna all'Area</label><select value={formAreaId} onChange={e => setFormAreaId(e.target.value)} className={inputClasses} required><option value="">-- Seleziona Area --</option>{availableAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                        </form>
                    </div>
                    <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors text-sm shadow-sm">Annulla</button>
                        <button type="submit" form="add-form-submit" disabled={isSaving} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors text-sm shadow-md disabled:opacity-70 disabled:cursor-not-allowed">{isSaving ? 'Salvataggio...' : 'Crea Modulo'}</button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
};

const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours, workAreas }) => {
    const [isMapMode, setIsMapMode] = useState(false);
    return (
        <div className="fade-in space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-200 pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">{isMapMode ? 'Mappa in Tempo Reale' : 'Dashboard'}</h1>
                <button onClick={() => setIsMapMode(!isMapMode)} className={`flex items-center gap-2 px-5 py-2.5 font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 ${isMapMode ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isMapMode ? <>🔙 Chiudi Mappa </> : <>🌍 Apri Mappa Presenze</>}
                </button>
            </div>
            {!isMapMode && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500 flex flex-col justify-between hover:shadow-xl transition-shadow">
                            <div><p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Dipendenti Attivi</p><p className="text-3xl font-bold text-gray-800 mt-2">{activeEmployeesDetails.length} <span className="text-lg text-gray-400 font-normal">/ {totalEmployees}</span></p></div>
                            <div className="mt-4 h-1 w-full bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${totalEmployees > 0 ? (activeEmployeesDetails.length / totalEmployees) * 100 : 0}%` }}></div></div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500 flex flex-col justify-between hover:shadow-xl transition-shadow">
                            <div><p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Ore Lavorate Oggi</p><p className="text-3xl font-bold text-gray-800 mt-2">{totalDayHours}</p></div>
                            <p className="text-xs text-gray-400 mt-2">Aggiornato in tempo reale</p>
                        </div>
                    </div>
                    <div className="mt-8">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 px-1">Chi è al Lavoro Ora</h2>
                        <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                            <div className="overflow-x-auto">
                                {activeEmployeesDetails.length > 0 ? (
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-blue-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Dipendente</th>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Area</th>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Entrata</th>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Stato</th>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Pausa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {activeEmployeesDetails.map(entry => (
                                                <tr key={entry.id} className="hover:bg-blue-50/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.employeeName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{entry.areaName}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{entry.clockInTimeFormatted}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap"><span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full shadow-sm ${entry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 'bg-green-100 text-green-800 border border-green-200'}`}>{entry.status}</span></td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{entry.status === 'In Pausa' ? (<span className="text-yellow-600 font-bold flex items-center gap-1">● In Corso</span>) : entry.hasCompletedPause ? (<span className="text-green-600 font-bold flex items-center gap-1">✓ Eseguita</span>) : (<span className="text-gray-400">-</span>)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-8 text-center text-gray-500">
                                        <p className="text-lg font-medium">Nessun dipendente attivo al momento.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
            {isMapMode && (
                <div className="bg-white p-3 rounded-xl shadow-lg h-[450px] flex flex-col animate-fade-in border border-gray-200">
                    <div style={{ flex: 1, minHeight: '500px' }} className="rounded-lg overflow-hidden border border-gray-300">
                        <MappaPresenze aree={workAreas} presenzeAttive={activeEmployeesDetails} />
                    </div>
                </div>
            )}
        </div>
    );
};

// --- NUOVA VISTA SPESE AGGIORNATA (CON ARCHIVIO e LOGICA PERMESSI) ---
const ExpensesView = ({ expenses, onProcessExpense, onEditExpense, currentUserRole, user }) => {
    const [showArchived, setShowArchived] = useState(false);

    // Filtra in base allo stato E ai permessi
    const displayedExpenses = expenses.filter(exp => {
        // 1. Filtro Archivio
        const isClosed = exp.status === 'closed' || exp.status === 'paid';
        const matchesArchive = showArchived ? isClosed : !isClosed;

        // 2. Filtro Utente: Se NON è Admin, vede solo le sue
        const isOwner = exp.userId === user.uid;
        if (currentUserRole !== 'admin' && !isOwner) {
            return false;
        }

        return matchesArchive;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">💰 Gestione Spese</h1>
                <button 
                    onClick={() => setShowArchived(!showArchived)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors ${showArchived ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'}`}
                >
                    {showArchived ? '🔙 Torna alle Spese Attive' : '📂 Mostra Archivio'}
                </button>
            </div>
            
            {!showArchived && (
                <div className="bg-yellow-50 text-yellow-800 px-4 py-2 rounded-lg text-sm border border-yellow-200">
                    {currentUserRole === 'admin' ? "⚠️ Clicca su \"Gestisci\" per saldarle e archiviarle." : "⚠️ Puoi visualizzare e modificare solo le tue spese."}
                </div>
            )}

            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-blue-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Dipendente</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Dettagli Spesa</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Pagato Con</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Allegato</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Importo</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {displayedExpenses.map(exp => {
                                let formattedDate = 'N/D';
                                if (exp.date && exp.date.toDate) {
                                    formattedDate = exp.date.toDate().toLocaleDateString('it-IT');
                                } else if (exp.date) {
                                    formattedDate = new Date(exp.date).toLocaleDateString('it-IT');
                                }
                                const isPreposto = exp.userRole === 'preposto';
                                return (
                                    <tr key={exp.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formattedDate}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="font-bold text-gray-900">{exp.userName || exp.userId}</div>
                                            {isPreposto && <span className="text-xs text-blue-600 border border-blue-200 bg-blue-50 px-1 rounded">Preposto</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-600 max-w-xs">
                                            <div className="font-semibold">{exp.description}</div>
                                            <div className="text-xs italic text-gray-500">{exp.note}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200 text-xs">
                                                {exp.paymentMethod || 'Non specificato'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {exp.receiptUrl ? (
                                                <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1">
                                                    📎 Vedi File
                                                </a>
                                            ) : (
                                                <span className="text-gray-400 text-xs">Nessun file</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">€ {parseFloat(exp.amount).toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {!showArchived ? (
                                                <>
                                                    {currentUserRole === 'admin' ? (
                                                        <button 
                                                            onClick={() => onProcessExpense(exp)}
                                                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded shadow text-xs font-bold"
                                                        >
                                                            ✅ Gestisci
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => onEditExpense(exp)} 
                                                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded shadow text-xs font-bold"
                                                        >
                                                            ✏️ Modifica
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-xs text-gray-500">
                                                    <div>Chiuso: {exp.adminPaymentMethod}</div>
                                                    {exp.adminNote && <div className="italic">Note: {exp.adminNote}</div>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {displayedExpenses.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            {showArchived ? "Nessuna spesa in archivio." : "Nessuna spesa trovata."}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, handleResetEmployeeDevice, adminEmployeeId, handleEmployeePauseClick, showArchived, setShowArchived }) => { 
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">👥 Gestione Dipendenti</h1>
                {/* --- TOGGLE ARCHIVIO --- */}
                <div className="flex items-center">
                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${showArchived ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        {showArchived ? '📂 Nascondi Archiviati' : '📂 Mostra Archiviati'}
                    </button>
                </div>
            </div>
            <div className="max-w-md">
                <div className="relative">
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca dipendente..." className="w-full pl-3 pr-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
            </div>
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-blue-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => requestSort('name')}>Nome{getSortIndicator('name')}</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Stato</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Aree Assegnate</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {employees.map(emp => {
                                const isSelfClockIn = emp.id === adminEmployeeId;
                                const clockInType = isSelfClockIn ? 'manualClockIn' : 'adminClockIn'; 
                                const clockOutType = isSelfClockIn ? 'manualClockOut' : 'adminClockOut'; 
                                
                                // Gestione Archiviati (Riga Rossa/Grigia)
                                const rowClass = emp.isDeleted ? "bg-red-50 hover:bg-red-100 transition-colors" : "hover:bg-blue-50/30 transition-colors";

                                return ( 
                                    <tr key={emp.id} className={rowClass}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className={`text-sm font-bold ${emp.isDeleted ? 'text-red-700 line-through' : 'text-gray-900'}`}>{emp.name} {emp.surname}</div>
                                                {emp.isDeleted && <span className="px-2 py-0.5 text-xs font-bold text-white bg-red-500 rounded">ARCHIVIATO</span>}
                                                {!emp.isDeleted && emp.deviceIds && emp.deviceIds.length > MAX_DEVICE_LIMIT && (
                                                    <div className="relative group cursor-help">
                                                        <span className="text-lg">⚠️</span>
                                                        <span className="absolute left-0 bottom-full mb-1 w-max px-2 py-1 text-xs text-white bg-red-600 rounded shadow-lg hidden group-hover:block z-50">
                                                            Limite superato: {emp.deviceIds.length} dispositivi!
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 break-all">{emp.email}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {emp.isDeleted ? (
                                                 <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-600 border border-red-200">Disattivato</span>
                                            ) : (
                                                 <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full border ${emp.activeEntry ? (emp.activeEntry.status === 'In Pausa' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200') : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{emp.activeEntry ? emp.activeEntry.status : 'Non al Lavoro'}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 max-w-xs truncate" title={emp.workAreaNames?.join(', ')}>{emp.workAreaNames?.join(', ') || 'Nessuna'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {emp.isDeleted ? (
                                                // --- AZIONI PER ARCHIVIATI (SOLO RIPRISTINO) ---
                                                currentUserRole === 'admin' && (
                                                    <button onClick={() => openModal('restoreEmployee', emp)} className="px-3 py-1.5 text-xs text-white bg-green-600 hover:bg-green-700 rounded shadow font-bold transition-colors">
                                                        ♻️ Ripristina
                                                    </button>
                                                )
                                            ) : (
                                                // --- AZIONI NORMALI ---
                                                <div className="flex flex-col items-start gap-2">
                                                    {emp.activeEntry ? (
                                                        <div className="flex gap-1 w-full">
                                                            <button onClick={() => openModal(clockOutType, emp)} disabled={emp.activeEntry.status === 'In Pausa'} className={`flex-1 px-3 py-1.5 text-xs text-white rounded-md shadow-sm transition-colors ${emp.activeEntry.status === 'In Pausa' ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600'}`}>Uscita</button>
                                                            <button onClick={() => handleEmployeePauseClick(emp)} disabled={!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)} className={`flex-1 px-3 py-1.5 text-xs text-white rounded-md shadow-sm transition-colors ${!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end) ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}>Pausa</button>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => openModal(clockInType, emp)} className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm transition-colors">▶️Timbra Entrata</button>
                                                    )}
                                                    <div className="flex flex-wrap gap-2 w-full mt-1">
                                                        {currentUserRole === 'admin' && (<><button onClick={() => openModal('assignArea', emp)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline decoration-blue-200 hover:decoration-blue-800">🌍Aree</button><button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-800 font-semibold underline decoration-green-200 hover:decoration-green-800">✏️Modifica</button><button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-800 font-semibold underline decoration-red-200 hover:decoration-red-800">🗑️Archivia</button></>)}
                                                        {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (<button onClick={() => openModal('resetDevice', emp)} disabled={emp.deviceIds?.length === 0} className="text-xs text-yellow-600 hover:text-yellow-800 font-semibold disabled:text-gray-400 underline decoration-yellow-200 hover:decoration-yellow-800">📱Reset Device</button>)}
                                                        {currentUserRole === 'preposto' && (<button onClick={() => openModal('prepostoAddEmployeeToAreas')} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">🌍Gestisci Aree</button>)}
                                                    </div>
                                                    {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (<div className="flex gap-2 mt-1 w-full pt-2 border-t border-gray-100"><button onClick={() => openModal('manualEntryForm', emp)} className="flex-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors">+ 🕒 Ore</button><button onClick={() => openModal('absenceEntryForm', emp)} className="flex-1 text-xs px-2 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded hover:bg-teal-100 transition-colors">+ 👀 Giust.</button></div>)}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                     {employees.length === 0 && (
                         <div className="p-8 text-center text-gray-500">Nessun risultato.</div>
                     )}
                </div>
            </div>
        </div>
    );
};

const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">Gestione Aree di Lavoro</h1>
        </div>
        <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-blue-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Nome Area</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Ore Totali</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Pausa (min)</th>
                            {currentUserRole === 'admin' && (<><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Coordinate</th><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Raggio</th></>)}
                            <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {workAreas.map(area => (
                            <tr key={area.id} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">📍{area.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 bg-gray-50 font-mono">{area.totalHours ? `${area.totalHours}h` : '0h'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{area.pauseDuration || 0} min</td>
                                {currentUserRole === 'admin' && (<><td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">{area.latitude?.toFixed(4)}, {area.longitude?.toFixed(4)}</td><td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{area.radius || 0} m</td></>)}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-3">
                                        {currentUserRole === 'admin' ? (<button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-800 font-semibold hover:underline">✏️Modifica</button>) : currentUserRole === 'preposto' ? (<button onClick={() => openModal('editAreaPauseOnly', area)} className="text-green-600 hover:text-green-800 font-semibold hover:underline">✏️Modifica Pausa</button>) : null}
                                        {currentUserRole === 'admin' && <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-800 font-semibold hover:underline">🗑️Elimina</button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

const FormsManagementView = ({ forms, workAreas, openModal, onDeleteForm }) => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">📋 Gestione Moduli & Questionari</h1>
            </div>
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-indigo-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider">Titolo Modulo</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider">Area Assegnata</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider">Link</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {forms.map(form => {
                                const areaName = workAreas.find(a => a.id === form.workAreaId)?.name || 'Area eliminata';
                                return (
                                    <tr key={form.id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{form.title}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{areaName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 underline max-w-xs truncate">
                                            <a href={form.url} target="_blank" rel="noreferrer">Apri Modulo ↗️</a>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button onClick={() => onDeleteForm(form.id)} className="text-red-600 hover:text-red-900 font-bold hover:underline">🗑️ Elimina</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {forms.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            Nessun modulo presente. Clicca su "Aggiungi Modulo Forms" per iniziare.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole, onDataUpdate }) => {
    if (currentUserRole !== 'admin') { return <div className="p-4 text-sm text-red-600 font-medium bg-red-50 rounded border border-red-200">Accesso negato.</div>; }
    const filteredAdmins = admins.filter(admin => admin.email !== superAdminEmail);
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4"><h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">Gestione Utenti Admin</h1></div>
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-blue-50"><tr><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Utente</th><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Ruolo</th><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Aree Gestite</th><th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Azioni</th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAdmins.map(admin => ( 
                                <tr key={admin.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-bold text-gray-900">{admin.name} {admin.surname}</div><div className="text-xs text-gray-500">{admin.email}</div></td>
                                    <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-bold uppercase rounded-md ${admin.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{admin.role}</span></td>
                                    <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 max-w-xs">{admin.managedAreaNames?.join(', ') || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium"><div className="flex items-center gap-2">{currentUserRole === 'admin' && (<button onClick={() => openModal('deleteAdmin', admin)} className="px-3 py-1.5 text-xs text-white bg-red-500 rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors shadow-sm" disabled={admin.email === user?.email}>🗑️Elimina</button>)}{admin.role === 'preposto' && (<button onClick={() => openModal('assignPrepostoAreas', admin)} className="px-3 py-1.5 text-xs text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors shadow-sm">🌍Assegna Aree</button>)}</div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredAdmins.length === 0 && (<div className="p-8 text-center text-gray-500">Nessun altro admin trovato.</div>)}
                </div>
            </div>
        </div>
    );
};

const ReportView = ({ reports, title, handleExportXml, dateRange, allWorkAreas, allEmployees, currentUserRole, userData, setDateRange, setReportAreaFilter, reportAreaFilter, reportEmployeeFilter, setReportEmployeeFilter, generateReport, isLoading, isActionLoading, managedEmployees, showNotification, handleReviewSkipBreak, onEditEntry }) => {
    
    // --- FUNZIONE EXPORT EXCEL PAGHE (Centrata + Colori + Mese/Anno) ---
    const handleExportPayrollExcel = () => {
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') { 
            showNotification("Libreria esportazione non caricata o errata.", 'error'); 
            return; 
        }
        if (!reports || reports.length === 0) { 
            showNotification("Nessun dato da esportare per il report paghe.", 'info'); 
            return; 
        }

        const centerStyle = { vertical: 'center', horizontal: 'center' };
        
        const areaColorMap = {};
        allWorkAreas.forEach((area, index) => {
            areaColorMap[area.id] = AREA_COLORS[index % AREA_COLORS.length];
        });

        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dateArray = [];
        let current = new Date(start);
        while (current <= end) {
            dateArray.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        const empData = {};
        const areaStats = {}; 

        reports.forEach(r => {
            if (r.isAbsence) return; 

            if (!empData[r.employeeId]) {
                empData[r.employeeId] = {
                    name: r.employeeName,
                    dailyData: {},
                    total: 0
                };
            }

            const hours = parseFloat(r.duration || 0);
            const parts = r.clockInDate.split('/');
            const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 

            if (!empData[r.employeeId].dailyData[isoDate]) {
                empData[r.employeeId].dailyData[isoDate] = { hours: 0, areaId: null };
            }
            
            const currentDayData = empData[r.employeeId].dailyData[isoDate];
            currentDayData.hours += hours;
            currentDayData.areaId = r.workAreaId; 

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

        dateArray.forEach(d => {
            headerRow1.push({ v: d.getDate(), t: 'n', s: { alignment: centerStyle } });
            headerRow2.push({ v: daysOfWeek[d.getDay()], t: 's', s: { alignment: centerStyle } });
        });
        
        headerRow1.push({ v: "TOTALE", t: 's', s: { font: { bold: true }, alignment: centerStyle } });
        headerRow2.push({ v: "", t: 's', s: { alignment: centerStyle } });

        const sheetData = [headerRow1, headerRow2]; 

        const sortedEmployees = Object.values(empData).sort((a,b) => a.name.localeCompare(b.name));
        
        sortedEmployees.forEach(emp => {
            const row = [{ v: emp.name, t: 's', s: { alignment: centerStyle } }];
            
            dateArray.forEach(d => {
                const iso = d.toISOString().split('T')[0];
                const dayData = emp.dailyData[iso];
                if (dayData && dayData.hours > 0) {
                    const cell = {
                        v: Number(dayData.hours.toFixed(2)),
                        t: 'n',
                        s: {
                            fill: { fgColor: { rgb: areaColorMap[dayData.areaId] || "FFFFFF" } },
                            alignment: centerStyle 
                        }
                    };
                    row.push(cell); 
                } else {
                    row.push({ v: "", t: 's', s: { alignment: centerStyle } });
                }
            });
            row.push({ v: Number(emp.total.toFixed(2)), t: 'n', s: { alignment: centerStyle, font: { bold: true } } });
            sheetData.push(row);
        });

        sheetData.push([]);
        sheetData.push([]);

        sheetData.push([
            { v: "RIEPILOGO PER AREA", t: 's', s: { font: { bold: true }, alignment: centerStyle } },
            { v: "TOT", t: 's', s: { font: { bold: true }, alignment: centerStyle } }
        ]);

        Object.keys(areaStats).sort().forEach(areaName => {
            const areaObj = allWorkAreas.find(a => a.name === areaName);
            const color = areaObj ? (areaColorMap[areaObj.id] || "FFFFFF") : "FFFFFF";
            
            const cellName = {
                v: areaName,
                t: 's',
                s: { fill: { fgColor: { rgb: color } }, font: { bold: true }, alignment: centerStyle }
            };
            const cellVal = {
                v: Number(areaStats[areaName].toFixed(2)),
                t: 'n',
                s: { alignment: centerStyle }
            };
            sheetData.push([cellName, cellVal]);
        });
        
        const ws = utils.aoa_to_sheet(sheetData);
        
        const wscols = [{wch: 30}]; 
        dateArray.forEach(() => wscols.push({wch: 5})); 
        wscols.push({wch: 12}); 
        ws['!cols'] = wscols;

        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Foglio Presenze");
        writeFile(wb, `Report_Paghe_${dateRange.start}_${dateRange.end}.xlsx`);
        showNotification("Excel Paghe generato con successo!", 'success');
    };

    const handleExportExcel = () => {
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') { showNotification("Libreria esportazione non caricata.", 'error'); return; }
        if (!reports || reports.length === 0) { showNotification("Nessun dato da esportare.", 'info'); return; }
        const dataToExport = reports.map(entry => ({
            'ID Dipendente': entry.employeeId, 
            'Dipendente': entry.employeeName, 
            'ID Area': entry.workAreaId || 'N/A', 
            'Area': entry.areaName, 
            'Data': entry.clockInDate,
            'Entrata': entry.clockInTimeFormatted, 
            'Uscita': entry.clockOutTimeFormatted,
            'Ore Lavorate (Netto)': entry.isAbsence ? 0 : ((entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso"),
            'Pausa Totale (Ore)': (entry.pauseHours !== null) ? parseFloat(entry.pauseHours.toFixed(2)) : 0,
            'Stato Pausa': entry.skippedBreak ? (entry.skipBreakStatus === 'approved' ? 'No Pausa (Approvato)' : 'Pausa Scalata (Default)') : 'Standard',
            'Motivo/Nota': entry.note
        }));
        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Report Ore");
        ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
        writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
        showNotification(`File Excel generato con successo.`, 'success');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-gray-200 pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">{title || 'Report Risultati'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={!reports || reports.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm transition-colors text-sm font-semibold">📥Esporta Excel (Dettagli)</button>
                    <button onClick={handleExportPayrollExcel} disabled={!reports || reports.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm transition-colors text-sm font-semibold">📥Excel Paghe (Griglia)</button>
                    <button onClick={() => handleExportXml(reports)} disabled={!reports || reports.length === 0} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm transition-colors text-sm font-semibold">📥Esporta XML</button>
                </div>
            </div>
            <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    {!reports || reports.length === 0 ? <div className="p-8 text-center text-gray-500">Nessun dato per il periodo selezionato.</div> : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-blue-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Dipendente</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Area</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Data</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Orari</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Ore Nette</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Stato Pausa</th> 
                                    <th className="px-6 py-3 text-left text-xs font-bold text-blue-800 uppercase tracking-wider">Note / Azioni</th> 
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {reports.map((entry) => (
                                    <tr key={entry.id} className={`${entry.isAbsence ? "bg-red-50/50" : "hover:bg-blue-50/30"} transition-colors`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.employeeName}{entry.createdBy && entry.employeeId && entry.createdBy !== entry.employeeId ? <span className="text-red-500 ml-1 font-bold" title="Inserito da Admin">*</span> : ''}</td>
                                        
                                        {entry.isAbsence ? (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 italic">N/A</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{entry.clockInDate}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center"><span className="px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-teal-100 text-teal-800 border border-teal-200">{entry.statusLabel}</span></td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-400">0.00</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">-</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium"><div className="flex flex-col gap-1"><button onClick={() => onEditEntry(entry)} className="flex items-center text-blue-600 hover:text-blue-900 font-semibold text-xs" title="✏️Modifica Giustificativo">📝 Modifica</button><span className="text-xs">{entry.note}</span></div></td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{entry.areaName}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.clockInDate}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{entry.clockInTimeFormatted} - {entry.clockOutTimeFormatted}</td> 
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 bg-gray-50">{entry.duration !== null ? entry.duration.toFixed(2) : '...'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {entry.skippedBreak ? (entry.skipBreakStatus === 'pending' ? <span className="px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-orange-100 text-orange-800 border border-orange-200 animate-pulse">⚠️ Verifica</span> : entry.skipBreakStatus === 'approved' ? <span className="px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-green-100 text-green-800 border border-green-200">✅ No Pausa</span> : <span className="px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-red-100 text-red-800 border border-red-200">❌ Scalata</span>) : (<span className="text-gray-500 text-xs">Standard ({entry.pauseHours !== null ? entry.pauseHours.toFixed(2) : '0.00'}h)</span>)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <div className="flex flex-col gap-2">
                                                        <button onClick={() => onEditEntry(entry)} className="text-left text-blue-600 hover:text-blue-900 font-semibold text-xs hover:underline" title="Correggi timbratura">✏️ Modifica</button>
                                                        {entry.skippedBreak && entry.skipBreakStatus === 'pending' ? (<div className="flex flex-col gap-1 p-2 bg-orange-50 rounded border border-orange-100"><span className="text-xs italic text-gray-700">"{entry.note}"</span><div className="flex gap-2 mt-1"><button onClick={() => handleReviewSkipBreak(entry.id, 'approved')} disabled={isActionLoading} className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded shadow-sm">Approva</button><button onClick={() => handleReviewSkipBreak(entry.id, 'rejected')} disabled={isActionLoading} className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded shadow-sm">Rifiuta</button></div></div>) : <span className="text-xs max-w-xs truncate" title={entry.note}>{entry.note}</span>}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

const ActionHeader = ({ view, currentUserRole, openModal, onOpenAddExpense }) => { 
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') return null;
    let button = null;
    let text = null;
    const btnClass = "px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 w-full sm:w-auto text-sm";
    
    if (view === 'employees' && currentUserRole === 'admin') { text = '+👤 Crea Nuovo Dipendente'; button = <button onClick={() => openModal('newEmployee')} className={btnClass}>{text}</button>; } 
    else if (view === 'areas' && currentUserRole === 'admin') { text = '+🌍 Aggiungi Area'; button = <button onClick={() => openModal('newArea')} className={btnClass}>{text}</button>; }
    else if (view === 'admins' && currentUserRole === 'admin') { text = '+👮Crea Nuovo Admin'; button = <button onClick={() => openModal('newAdmin')} className={btnClass}>{text}</button>; }
    else if (view === 'employees' && currentUserRole === 'preposto') { text = '+👤 Aggiungi Dipendente alle Mie Aree'; button = <button onClick={() => openModal('prepostoAddEmployeeToAreas')} className={btnClass}>{text}</button>; }
    else if (view === 'forms') { text = '+🔗 Aggiungi Modulo Forms'; button = <button onClick={() => openModal('newForm')} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 w-full sm:w-auto text-sm">{text}</button>; }
    
    // NUOVO BOTTONE AGGIUNGI SPESA (Admin + Preposto)
    else if (view === 'expenses') { 
        text = '+ 💰 Registra Spesa'; 
        button = <button onClick={onOpenAddExpense} className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 w-full sm:w-auto text-sm">{text}</button>; 
    }

    if (!button) return null;
    return (<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4"><div className="flex justify-end">{button}</div></div>);
};

// ===========================================
// --- 3. COMPONENTE PRINCIPALE (LOGICA) ---
// ===========================================

const AdminDashboard = ({ user, handleLogout, userData }) => {

    const [view, setView] = useState('dashboard');
    const [allEmployees, setAllEmployees] = useState([]); 
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEmployeesDetails, setActiveEmployeesDetails] = useState([]);
    const [reports, setReports] = useState([]);
    const [forms, setForms] = useState([]);
    const [expenses, setExpenses] = useState([]); 
    
    // STATO PER FILTRARE GLI ARCHIVIATI
    const [showArchived, setShowArchived] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isLoading, setIsLoading] = useState(false); 
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
    const [workAreasWithHours, setWorkAreasWithHours] = useState([]);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0); 
    const [notification, setNotification] = useState(null); 
    const [entryToEdit, setEntryToEdit] = useState(null);

    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [showAddFormModal, setShowAddFormModal] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false); // NUOVO STATO MODALE SPESA
    
    // NUOVI STATI PER GESTIONE SPESE
    const [expenseToProcess, setExpenseToProcess] = useState(null); // Spesa selezionata per chiusura
    const [expenseToEdit, setExpenseToEdit] = useState(null); // Spesa selezionata per MODIFICA (User)

    const currentUserRole = userData?.role;
    const superAdminEmail = SUPER_ADMIN_EMAIL; 

    const handleSwitchView = (newView) => {
        setView(newView);
    };

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000); 
    }, []);

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
            const [areasSnap, empsSnap, formsSnap] = await Promise.all([
                getDocs(collection(db, "work_areas")),
                getDocs(collection(db, "employees")),
                getDocs(collection(db, "area_forms"))
            ]);
            
            if (!isMounted) return;

            const allAreasList = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allEmployeesList = empsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            let allFormsList = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (role === 'preposto') {
                const managedIds = userData?.managedAreaIds || [];
                allFormsList = allFormsList.filter(f => managedIds.includes(f.workAreaId));
            }

            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));
            setAllEmployees(allEmployeesList); 
            setForms(allFormsList);

            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 if (!isMounted) return; 
                 const profile = adminEmployeeSnapshot.empty ? null : { id: adminEmployeeSnapshot.docs[0].id, userId: user.uid, ...adminEmployeeSnapshot.docs[0].data() };
                 setAdminEmployeeProfile(profile);
            } else {
                 setAdminEmployeeProfile(null); 
            }

            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                if (!isMounted) return; 
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                setAdmins(adminUsers);
            } else {
                setAdmins([]); 
            }

        } catch (error) {
            console.error("Errore caricamento dati statici:", error);
            if (isMounted) showNotification("Errore caricamento dati iniziali.", 'error');
        } finally {
            if (isMounted) setIsLoading(false);
        }
        
        return () => { isMounted = false; };
    }, [user, userData, superAdminEmail, showNotification]);

    useEffect(() => {
        if (user && userData) fetchData();
    }, [user, userData, fetchData]); 

    // --- LISTENER SPESE (ADMIN + PREPOSTO) ---
    useEffect(() => {
        if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') return;
        const q = query(collection(db, "expenses"), orderBy("date", "desc"), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setExpenses(expensesData);
        }, (error) => {
            console.error("Errore listener spese:", error);
        });
        return () => unsubscribe();
    }, [currentUserRole]);

    useEffect(() => {
        const activeOnly = allEmployees.filter(e => !e.isDeleted);
        if (activeOnly.length > 0) {
            const violators = activeOnly.filter(e => e.deviceIds && e.deviceIds.length > MAX_DEVICE_LIMIT);
            if (violators.length > 0) {
                setTimeout(() => {
                    showNotification(`ATTENZIONE: ${violators.length} dipendenti hanno superato il limite di ${MAX_DEVICE_LIMIT} dispositivi! Controlla la lista.`, 'error');
                }, 1000);
            }
        }
    }, [allEmployees, showNotification]);

    const sortedAndFilteredEmployees = useMemo(() => {
        let baseList = managedEmployees;
        
        if (showArchived) {
            baseList = baseList.filter(emp => emp.isDeleted);
        } else {
            baseList = baseList.filter(emp => !emp.isDeleted);
        }

        const employeesWithDetails = baseList.map(emp => ({
            ...emp,
            workAreaNames: (emp.workAreaIds || []).map(id => {
                const area = allWorkAreas.find(a => a.id === id);
                return area ? area.name : `ID Mancante`; 
            }).filter(Boolean),
            activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null,
        }));
        
        let filterableItems = [...employeesWithDetails];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp => `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter));
        }
        
        if (sortConfig.key) {
             filterableItems.sort((a, b) => { 
                 let aValue = (sortConfig.key === 'name') ? `${a.name} ${a.surname}` : a[sortConfig.key];
                 let bValue = (sortConfig.key === 'name') ? `${b.name} ${b.surname}` : b[sortConfig.key];
                 if (aValue == null) aValue = ''; if (bValue == null) bValue = '';
                 aValue = String(aValue); bValue = String(bValue);
                 if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 return 0;
             });
        }
        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig, showArchived]); 

    const visibleWorkAreas = useMemo(() => {
        if (currentUserRole === 'admin') return workAreasWithHours;
        if (currentUserRole === 'preposto') {
            const managedAreaIds = userData?.managedAreaIds || [];
            return workAreasWithHours.filter(area => managedAreaIds.includes(area.id));
        }
        return [];
    }, [workAreasWithHours, currentUserRole, userData]);

    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) return;
        let isMounted = true; 
        const qActive = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
            if (!isMounted) return; 
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (adminEmployeeProfile) {
                const adminEntry = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                const hasCompletedPause = adminEntry?.pauses?.some(p => p.start && p.end) || false;
                setAdminActiveEntry(adminEntry ? { ...adminEntry, id: adminEntry.id, isOnBreak: adminEntry.pauses?.some(p => !p.end) || false, hasCompletedPause: hasCompletedPause } : null);
            }
            const details = activeEntriesList.filter(entry => entry.clockInTime).map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false; 
                    const hasCompletedPause = entry.pauses?.some(p => p.start && p.end) || false; 
                    let clockInFormatted = 'N/D';
                    if (entry.clockInTime && typeof entry.clockInTime.toDate === 'function') {
                        try {
                           const clockInDate = entry.clockInTime.toDate();
                           clockInFormatted = new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'}).format(clockInDate);
                        } catch (e) { console.error("Errore formattazione ora entrata:", e); }
                    }
                    return { id: entry.id, employeeId: entry.employeeId, employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto', areaName: area ? area.name : 'Sconosciuta', workAreaId: entry.workAreaId, clockInTimeFormatted: clockInFormatted, status: isOnBreak ? 'In Pausa' : 'Al Lavoro', pauses: entry.pauses || [], hasCompletedPause: hasCompletedPause };
                }).filter(detail => {
                    if (currentUserRole === 'admin') return true; 
                    if (currentUserRole === 'preposto') {
                         const managedAreaIds = userData?.managedAreaIds || []; 
                         if (managedAreaIds.length === 0) return false; 
                         return managedAreaIds.includes(detail.workAreaId);
                    }
                    return false; 
                }).sort((a, b) => a.employeeName.localeCompare(b.employeeName)); 
            setActiveEmployeesDetails(details);
        }, (error) => { if (isMounted) { console.error("Errore listener timbratura attive:", error); showNotification("Errore aggiornamento presenze.", 'error'); } });

        const qPending = query(collection(db, "time_entries"), where("skipBreakStatus", "==", "pending"));
        const unsubscribePending = onSnapshot(qPending, (snapshot) => {
            if (!isMounted) return;
            const pendingDocs = snapshot.docs.map(doc => doc.data());
            let count = 0;
            if (currentUserRole === 'admin') count = pendingDocs.length;
            else if (currentUserRole === 'preposto') {
                const managedAreaIds = userData?.managedAreaIds || [];
                const myPending = pendingDocs.filter(d => managedAreaIds.includes(d.workAreaId));
                count = myPending.length;
            }
            setPendingRequestsCount(count);
        });
        return () => { isMounted = false; unsubscribeActive(); unsubscribePending(); };
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole, userData, showNotification]);

    useEffect(() => {
        let isMounted = true; 
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!isMounted) return; 
            let totalMinutes = 0; const now = new Date();
            snapshot.docs.forEach(doc => {
                const entry = doc.data(); if (!entry.clockInTime) return;
                
                if (currentUserRole === 'preposto') {
                     const managedAreaIds = userData?.managedAreaIds || []; 
                     if (!entry.workAreaId || !managedAreaIds.includes(entry.workAreaId)) return;
                 }

                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : (entry.status === 'clocked-in' ? now : clockIn);
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) {
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        return acc + (endMillis - startMillis);
                    } return acc;
                }, 0);
                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;
                if (durationMs > 0) totalMinutes += (durationMs / 60000);
            });
            setTotalDayHours((totalMinutes / 60).toFixed(2));
        }, (error) => { if (isMounted) { console.error("Errore listener ore totali:", error); showNotification("Errore aggiornamento ore totali.", 'error'); } });
        return () => { isMounted = false; unsubscribe(); };
    }, [currentUserRole, userData, showNotification]); 

    // --- LOGICA GESTIONE SPESA (CHIUSURA/ARCHIVIAZIONE) ---
    const handleConfirmProcessExpense = async (expenseId, paymentMethod, note) => {
        setIsActionLoading(true);
        try {
            await updateDoc(doc(db, "expenses", expenseId), {
                status: 'closed',
                adminPaymentMethod: paymentMethod,
                adminNote: note,
                closedAt: Timestamp.now(),
                closedBy: user.email
            });
            showNotification("Spesa archiviata con successo!", 'success');
            setExpenseToProcess(null); // Chiudi modale
        } catch (error) {
            console.error("Errore archiviazione spesa:", error);
            showNotification("Errore durante l'archiviazione.", 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleAdminClockIn = useCallback(async (areaId, timestamp, note) => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura ENTRATA manuale per ${adminEmployeeProfile.name}`);
    }, [adminEmployeeProfile, showNotification]);

    const handleAdminClockOut = useCallback(async (note) => { 
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura USCITA manuale per ${adminEmployeeProfile.name}`);
    }, [adminActiveEntry, adminEmployeeProfile, showNotification]);

    const handleAdminPause = useCallback(async () => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        if (adminActiveEntry.isOnBreak) {
            setIsActionLoading(true);
            try {
                const togglePauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'prepostoTogglePause');
                const result = await togglePauseFunction({ deviceId: 'ADMIN_MANUAL_ACTION' });
                showNotification(result.data.message, 'success'); 
            } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
            finally { setIsActionLoading(false); } return; 
        }
        if (adminActiveEntry.hasCompletedPause) return showNotification("Hai già completato la pausa automatica in questa sessione.", 'info');
        const workArea = allWorkAreas.find(area => area.id === adminActiveEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) return showNotification(`Nessuna pausa predefinita (>0 min) configurata per l'area "${workArea?.name || 'sconosciuta'}".`, 'info');
        const pauseDurationInMinutes = workArea.pauseDuration;
        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti per te stesso? L'azione è immediata e irreversibile.`)) return;
        setIsActionLoading(true);
        try {
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
            const result = await applyPauseFunction({ timeEntryId: adminActiveEntry.id, durationMinutes: pauseDurationInMinutes, deviceId: 'ADMIN_MANUAL_ACTION' });
            showNotification(result.data.message, 'success'); 
        } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
        finally { setIsActionLoading(false); }
    }, [adminActiveEntry, adminEmployeeProfile, allWorkAreas, showNotification]);

    const handleEmployeePauseClick = useCallback(async (employee) => {
        const timeEntryId = employee?.activeEntry?.id; 
        if (!timeEntryId) return showNotification("Errore: ID della timbratura attiva non trovato.", 'error');
        
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) 
            return showNotification(`Nessuna pausa predefinita configurata per l'area "${workArea?.name || 'sconosciuta'}". Modifica l'area per aggiungerla.`, 'info');
        
        const pauseDurationInMinutes = workArea.pauseDuration;
        
        if (employee.activeEntry.hasCompletedPause) 
            return showNotification(`La pausa predefinita di ${pauseDurationInMinutes} minuti è stata già completata per ${employee.name} in questa sessione.`, 'info');
        
        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti a ${employee.name} ${employee.surname}?`)) return;
        
        setIsActionLoading(true);
        try {
            const now = new Date();
            const startPause = new Date(now.getTime() - (pauseDurationInMinutes * 60000));
            
            const entryRef = doc(db, "time_entries", timeEntryId);
            
            await updateDoc(entryRef, {
                pauses: arrayUnion({
                    start: Timestamp.fromDate(startPause),
                    end: Timestamp.fromDate(now),
                    type: 'manual_forced',
                    addedBy: user.email || 'admin'
                })
            });

            showNotification("Pausa inserita con successo!", 'success');
        } catch (error) { 
            console.error("Errore inserimento pausa:", error); 
            showNotification(`Errore: ${error.message}`, 'error'); 
        } finally { 
            setIsActionLoading(false); 
        }
    }, [allWorkAreas, user, showNotification]);

    const handleDeleteForm = async (formId) => {
        if (!window.confirm("Sei sicuro di voler eliminare questo modulo?")) return;
        try {
            await deleteDoc(doc(db, "area_forms", formId));
            showNotification("Modulo eliminato.", "success");
            fetchData(); 
        } catch (error) {
            console.error("Errore eliminazione:", error);
            showNotification("Errore eliminazione modulo.", "error");
        }
    };

    const openModal = useCallback((type, item = null) => {
        if (type === 'prepostoAddEmployeeToAreas') {
            setShowAddEmployeeModal(true); 
            return; 
        }

        if (type === 'newForm') {
            setShowAddFormModal(true); 
        } else {
            setModalType(type);
            setSelectedItem(item);
            setShowModal(true);
        }
    }, []);

    const handleResetEmployeeDevice = useCallback(async (employee) => {
        if (!employee || !employee.id) return showNotification("Dipendente non valido.", 'error');
        if (!window.confirm(`Sei sicuro di resettare il dispositivo per ${employee.name} ${employee.surname}?`)) return;
        setIsActionLoading(true);
        try {
            const employeeRef = doc(db, "employees", employee.id);
            await updateDoc(employeeRef, { deviceIds: [] });
            showNotification(`Dispositivo resettato per ${employee.name} ${employee.surname}.`, 'success');
            await fetchData();
        } catch (error) { console.error("Errore reset dispositivo:", error); showNotification(`Errore reset dispositivo: ${error.message}`, 'error'); } finally { setIsActionLoading(false); }
    }, [fetchData, showNotification]);
    
    const generateReport = useCallback(async () => {
        if (!dateRange.start || !dateRange.end) return showNotification("Seleziona date valide.", 'info');
        setIsLoading(true);
        let isMounted = true; 
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const generateReportFunction = httpsCallable(functions, 'generateTimeReport');
            const result = await generateReportFunction({ startDate: dateRange.start, endDate: dateRange.end, employeeIdFilter: reportEmployeeFilter, areaIdFilter: reportAreaFilter });
            if (!isMounted) return; 
            
            let fetchedEntries = result.data.reports;

            if (currentUserRole === 'preposto') {
                const managedIds = userData?.managedAreaIds || [];
                fetchedEntries = fetchedEntries.filter(entry => {
                    if (entry.isAbsence) return true; 
                    return managedIds.includes(entry.workAreaId);
                });
            }

            const areaHoursMap = new Map(allWorkAreas.map(area => [area.id, 0]));
            const formatTime = (date, time) => { const finalTime = time === 'In corso' ? '99:99' : time; const formattedDate = date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'); return new Date(`${formattedDate} ${finalTime}`); };
            const reportData = fetchedEntries.map(entry => {
                const clockIn = entry.clockInTime ? new Date(entry.clockInTime) : null;
                const clockOut = entry.clockOutTime ? new Date(entry.clockOutTime) : null;
                if (!clockIn) return null; 
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                if (!employee) return null; 
                let durationHours = null; let pauseDurationMinutes = 0; let pauseHours = 0; let clockInFormatted = 'N/D'; let clockOutFormatted = 'In corso';
                try {
                    clockInFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockIn);
                    if (clockOut) { clockOutFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockOut); }
                } catch (e) { console.error("Errore formattazione ora report:", e); }
                if (entry.isAbsence) {
                    return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: "---", clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), clockInTimeFormatted: "-", clockOutTimeFormatted: "-", duration: 0, pauseHours: 0, note: entry.note || entry.absenceType, statusLabel: entry.absenceType ? entry.absenceType.toUpperCase() : "ASSENZA", isAbsence: true, workAreaId: null };
                }
                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    const recordedPausesMs = (entry.pauses || []).reduce((acc, p) => { const pauseStart = p.start ? new Date(p.start) : null; const pauseEnd = p.end ? new Date(p.end) : null; if (pauseStart && pauseEnd) { return acc + (pauseEnd.getTime() - pauseStart.getTime()); } return acc; }, 0);
                    const areaPauseMs = (area?.pauseDuration || 0) * 60000;
                    let finalPauseDeductionMs = recordedPausesMs;
                    if (entry.skippedBreak) { if (entry.skipBreakStatus === 'approved') { finalPauseDeductionMs = 0; } else { finalPauseDeductionMs = areaPauseMs; } } else { if (areaPauseMs > 0 && recordedPausesMs < areaPauseMs) { finalPauseDeductionMs = areaPauseMs; } }
                    pauseDurationMinutes = finalPauseDeductionMs / 60000; pauseHours = pauseDurationMinutes / 60; 
                    let calculatedDurationMs = totalMs > 0 ? (totalMs - finalPauseDeductionMs) : 0; if (calculatedDurationMs < 0) calculatedDurationMs = 0;
                    durationHours = calculatedDurationMs > 0 ? (calculatedDurationMs / 3600000) : 0; 
                    if (area) { areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours); }
                }
                return { id: entry.id, employeeName: `${employee.name} ${employee.surname}`, employeeId: entry.employeeId, areaName: area ? area.name : 'Sconosciuta', clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }), clockInTimeFormatted: clockInFormatted, clockOutTimeFormatted: clockOutFormatted, duration: durationHours, pauseHours: pauseHours, note: entry.note || '', createdBy: entry.createdBy || null, skippedBreak: entry.skippedBreak, skipBreakStatus: entry.skipBreakStatus, skippedBreakReason: entry.skippedBreakReason, workAreaId: entry.workAreaId };
            }).filter(Boolean).sort((a, b) => { const dateA = formatTime(a.clockInDate, a.clockInTimeFormatted); const dateB = formatTime(b.clockInDate, b.clockOutTimeFormatted); if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) { if (a.clockInDate !== b.clockInDate) return a.clockInDate.localeCompare(b.clockInDate); return a.employeeName.localeCompare(b.employeeName); } if (dateA < dateB) return -1; if (dateA > dateB) return 1; return a.employeeName.localeCompare(b.employeeName); });
            setReports(reportData); setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);
            const updatedAreas = allWorkAreas.map(area => ({ ...area, totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) }));
            setWorkAreasWithHours(updatedAreas);
            if(reportData.length > 0) setView('reports'); 
        } catch (error) { const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message; showNotification(`Errore generazione report: ${displayMessage || 'Errore Server.'}`, 'error'); console.error(error); }
        finally { if (isMounted) setIsLoading(false); }
        return () => { isMounted = false; };
    }, [dateRange, reportAreaFilter, reportEmployeeFilter, allEmployees, allWorkAreas, showNotification, currentUserRole, userData]); 

    const handleReviewSkipBreak = useCallback(async (entryId, decision) => {
        if (!entryId || !decision) return;
        const confirmMsg = decision === 'approved' ? "Confermi che il dipendente NON ha fatto pausa? Verranno calcolate le ore piene." : "Rifiuti la richiesta? Verrà sottratta la pausa standard dell'area.";
        if (!window.confirm(confirmMsg)) return;
        setIsActionLoading(true);
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const reviewFunction = httpsCallable(functions, 'reviewSkipBreakRequest');
            await reviewFunction({ timeEntryId: entryId, decision: decision, adminId: user.uid });
            showNotification(`Richiesta ${decision === 'approved' ? 'APPROVATA' : 'RIFIUTATA'} con successo.`, 'success');
            generateReport(); 
        } catch (error) { console.error("Errore revisione pausa:", error); showNotification("Errore durante l'aggiornamento della richiesta.", 'error'); } finally { setIsActionLoading(false); }
    }, [user, showNotification, generateReport]);

    const handleSaveEntryEdit = async (entryId, updatedData) => {
        setIsActionLoading(true);
        try {
            const entryRef = doc(db, "time_entries", entryId);
            const newClockInDate = new Date(`${updatedData.date}T${updatedData.clockInTime}:00`);
            let updatePayload = { workAreaId: updatedData.workAreaId, note: updatedData.note, clockInTime: Timestamp.fromDate(newClockInDate), skippedBreak: updatedData.skippedBreak, skipBreakStatus: updatedData.skippedBreak ? 'approved' : 'none' };
            if (updatedData.clockOutTime) {
                const newClockOutDate = new Date(`${updatedData.date}T${updatedData.clockOutTime}:00`);
                if (newClockOutDate <= newClockInDate) { throw new Error("L'ora di uscita deve essere successiva all'entrata."); }
                updatePayload.clockOutTime = Timestamp.fromDate(newClockOutDate); updatePayload.status = 'clocked-out'; 
            }
            updatePayload.lastModifiedBy = user.email; updatePayload.lastModifiedAt = Timestamp.now();
            await updateDoc(entryRef, updatePayload);
            showNotification("Timbratura (orari e stato pausa) aggiornata con successo!", "success");
            setEntryToEdit(null); generateReport(); 
        } catch (error) { console.error("Errore modifica:", error); showNotification("Errore: " + error.message, "error"); } finally { setIsActionLoading(false); }
    };

    const handleExportXml = useCallback((dataToExport) => {
        if (!dataToExport || dataToExport.length === 0) return showNotification("Nessun dato da esportare.", 'info'); 
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
        dataToExport.forEach(entry => {
            xmlString += `  <Timbratura>\n`;
            xmlString += `    <IdDipendente>${entry.employeeId}</IdDipendente>\n`;
            xmlString += `    <Dipendente><![CDATA[${entry.employeeName || ''}]]></Dipendente>\n`;
            xmlString += `    <IdArea>${entry.workAreaId}</IdArea>\n`;
            xmlString += `    <Area><![CDATA[${entry.areaName || ''}]]></Area>\n`;
            xmlString += `    <Data>${entry.clockInDate || ''}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted}</Entrata>\n`; 
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted}</Uscita>\n`; 
            xmlString += `    <OreNetto>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</OreNetto>\n`;
            xmlString += `    <PausaTotaleOre>${entry.pauseHours ? entry.pauseHours.toFixed(2) : '0.00'}</PausaTotaleOre>\n`; 
            xmlString += `    <StatoPausa>${entry.skippedBreak ? (entry.skipBreakStatus === 'approved' ? 'No Pausa (Approvato)' : 'Pausa Scalata (Default)') : 'Standard'}</StatoPausa>\n`;
            xmlString += `    <MotivoNota><![CDATA[${entry.note || ''}]]></MotivoNota>\n`; 
            xmlString += `  </Timbratura>\n`;
        });
        xmlString += '</ReportTimbrature>';
        try { const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" }); saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`); showNotification(`File XML '${(reportTitle || 'Report').replace(/ /g, '_')}.xml' generato con successo.`, 'success'); } catch (error) { showNotification("Errore salvataggio XML.", 'error'); console.error(error); } 
    }, [reportTitle, showNotification]);
    
    const requestSort = useCallback((key) => {
        let direction = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);
    
    // --- RENDER ---
    if (isLoading || !user || !userData) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento...</p></div>;
    }
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') {
       return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato.</p></div>;
    }

    // Conta solo le spese non chiuse per il badge
    const activeExpensesCount = expenses.filter(e => e.status !== 'closed' && e.status !== 'paid').length;

    return (
        <div className="min-h-screen bg-gray-100 w-full font-sans text-gray-800">
            {notification && <NotificationPopup message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header */}
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                     <CompanyLogo />
                     {adminEmployeeProfile && (
                         <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center shadow-inner">
                             {adminActiveEntry ? (
                                 <div className="space-y-2">
                                     <div>
                                         <p className="text-sm font-semibold text-green-600">Sei al lavoro</p>
                                         {adminActiveEntry.isOnBreak && <p className="text-xs font-semibold text-yellow-600">In Pausa</p>}
                                     </div>
                                     <div className="flex gap-2 justify-center">
                                         <button onClick={handleAdminPause} 
                                            disabled={isActionLoading || (!adminActiveEntry.isOnBreak && adminActiveEntry.hasCompletedPause)} 
                                            className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} disabled:opacity-50`}
                                         >
                                               {adminActiveEntry.isOnBreak ? 'Termina Pausa' : '☕Inizia Pausa'}
                                         </button>
                                         <button onClick={() => openModal('manualClockOut', adminEmployeeProfile)} disabled={adminActiveEntry.isOnBreak || isActionLoading} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:opacity-50">
                                              ⏹️Timbra Uscita
                                         </button>
                                     </div>
                                 </div>
                             ) : (
                                 <div>
                                     <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                     <button onClick={() => openModal('manualClockIn', adminEmployeeProfile)} disabled={isActionLoading} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">▶️Timbra Entrata</button>
                                 </div>
                             )}
                          </div>
                     )}
                     <div className="flex items-center space-x-4">
                         <span className="text-sm text-gray-600 text-right">
                             {currentUserRole === 'admin' ? 'Amministratore' : 'Preposto'}:<br/>
                             <span className="font-medium">{userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}</span>
                         </span>
                         <button onClick={handleLogout} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded shadow-sm hover:bg-gray-50 transition-colors">🚪Logout</button>
                     </div>
                 </div>
            </header>

            {/* Navigazione */}
            <nav className="bg-white border-b border-gray-200 shadow-sm">
                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                     <div className="flex justify-center">
                         <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                             <button onClick={() => handleSwitchView('dashboard')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>🏠Dashboard</button>
                             <button onClick={() => handleSwitchView('employees')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>👥Gestione Dipendenti</button>
                             <button onClick={() => handleSwitchView('areas')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>📍GestioneAree</button>
                             <button disabled className="py-2 px-3 sm:border-b-2 text-sm font-medium border-transparent text-gray-300 cursor-not-allowed" title="In arrivo...">📋Moduli Forms</button>
                             {currentUserRole === 'admin' && <button onClick={() => handleSwitchView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>👮Gestione Admin</button>}
                             
                             {/* BOTTONE SPESE AGGIORNATO (Admin e Preposto) */}
                             {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                <button 
                                    onClick={() => handleSwitchView('expenses')} 
                                    className={`py-2 px-3 sm:border-b-2 text-sm font-medium flex items-center ${view === 'expenses' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                                >
                                    💰 Spese
                                    {activeExpensesCount > 0 && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                                            {activeExpensesCount}
                                        </span>
                                    )}
                                </button>
                             )}
                             {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                <button 
                                    onClick={() => handleSwitchView('reports')} 
                                    className={`py-2 px-3 sm:border-b-2 text-sm font-medium flex items-center ${view === 'reports' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                                >
                                    📋Report
                                    {pendingRequestsCount > 0 && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                            ⚠️ {pendingRequestsCount}
                                        </span>
                                    )}
                                </button>
                             )}
                         </div>
                     </div>
                 </div>
            </nav>

            <ActionHeader view={view} currentUserRole={currentUserRole} openModal={openModal} onOpenAddExpense={() => { setExpenseToEdit(null); setShowAddExpenseModal(true); }} />

            {/* CONTENUTO PRINCIPALE */}
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                <main>
                    {view === 'dashboard' && <DashboardView 
                        totalEmployees={managedEmployees.length} 
                        activeEmployeesDetails={activeEmployeesDetails} 
                        totalDayHours={totalDayHours} 
                        workAreas={visibleWorkAreas} 
                    />}
                    
                    {/* VISTA SPESE AGGIORNATA */}
                    {view === 'expenses' && <ExpensesView 
                        expenses={expenses} 
                        onProcessExpense={setExpenseToProcess} 
                        onEditExpense={(exp) => { setExpenseToEdit(exp); setShowAddExpenseModal(true); }}
                        currentUserRole={currentUserRole}
                        user={user}
                    />}
                    
                    {view === 'employees' && <EmployeeManagementView 
                        employees={sortedAndFilteredEmployees} 
                        openModal={openModal} 
                        currentUserRole={currentUserRole} 
                        requestSort={requestSort} 
                        sortConfig={sortConfig} 
                        searchTerm={searchTerm} 
                        setSearchTerm={setSearchTerm} 
                        handleResetEmployeeDevice={handleResetEmployeeDevice} 
                        adminEmployeeId={adminEmployeeProfile?.id} 
                        handleEmployeePauseClick={handleEmployeePauseClick} 
                        // NUOVI PROPS PER GESTIONE ARCHIVIO
                        showArchived={showArchived}
                        setShowArchived={setShowArchived}
                    />}
                    
                    {view === 'areas' && <AreaManagementView workAreas={visibleWorkAreas} openModal={openModal} currentUserRole={currentUserRole} />}
                    
                    {view === 'forms' && <FormsManagementView forms={forms} workAreas={allWorkAreas} openModal={openModal} onDeleteForm={handleDeleteForm} />}

                    {view === 'admins' && currentUserRole === 'admin' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} />}
                    
                    {view === 'reports' && (
                        <>
                            <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Genera Report Personalizzato</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                                    <div className="lg:col-span-1"><label htmlFor="startDate" className="block text-xs font-bold text-gray-500 uppercase mb-1">Da</label><input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-2.5 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                    <div className="lg:col-span-1"><label htmlFor="endDate" className="block text-xs font-bold text-gray-500 uppercase mb-1">A</label><input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-2.5 border border-gray-300 rounded-lg w-full text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                    <div className="lg:col-span-1"><label htmlFor="areaFilter" className="block text-xs font-bold text-gray-500 uppercase mb-1">Area</label><select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg w-full text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="all">Tutte le Aree</option>{(currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))).sort((a,b) => a.name.localeCompare(b.name)).map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                                    <div className="lg:col-span-1"><label htmlFor="employeeFilter" className="block text-xs font-bold text-gray-500 uppercase mb-1">Dipendente</label><select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-2.5 border border-gray-300 rounded-lg w-full text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="all">Tutti i Dipendenti</option>{(currentUserRole === 'admin' ? allEmployees : managedEmployees).sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}</select></div>
                                    <div className="lg:col-span-1"><button onClick={generateReport} disabled={isLoading || isActionLoading} className="px-4 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-600 text-sm w-full disabled:opacity-50">📄Genera Report</button></div>
                                </div>
                            </div>
                            <ReportView 
                                reports={reports} 
                                title={reportTitle} 
                                handleExportXml={handleExportXml} 
                                dateRange={dateRange} 
                                allWorkAreas={allWorkAreas} 
                                allEmployees={allEmployees} 
                                currentUserRole={currentUserRole} 
                                userData={userData} 
                                setDateRange={setDateRange} 
                                setReportAreaFilter={setReportAreaFilter} 
                                reportAreaFilter={reportAreaFilter} 
                                reportEmployeeFilter={reportEmployeeFilter} 
                                setReportEmployeeFilter={setReportEmployeeFilter} 
                                generateReport={generateReport} 
                                isLoading={isLoading} 
                                isActionLoading={isActionLoading} 
                                managedEmployees={managedEmployees} 
                                showNotification={showNotification} 
                                handleReviewSkipBreak={handleReviewSkipBreak} 
                                onEditEntry={(entry) => setEntryToEdit(entry)} 
                                handleSaveEntryEdit={handleSaveEntryEdit}
                            />
                        </>
                    )}
                </main>
            </div>
            
            <footer className="w-full bg-white border-t border-gray-200 py-6 mt-8">
                <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">
                     &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
                </p>
            </footer>

            {/* Modale Modifica Timbratura */}
            {entryToEdit && (
                <EditTimeEntryModal 
                    entry={entryToEdit}
                    workAreas={allWorkAreas}
                    onClose={() => setEntryToEdit(null)}
                    onSave={handleSaveEntryEdit}
                    isLoading={isActionLoading}
                />
            )}

            {showModal && (
                 <AdminModal
                     type={modalType}
                     item={selectedItem}
                     setShowModal={setShowModal}
                     workAreas={allWorkAreas}
                     onDataUpdate={fetchData}
                     user={user}
                     superAdminEmail={superAdminEmail}
                     allEmployees={allEmployees}
                     currentUserRole={currentUserRole}
                     userData={userData} 
                     onAdminClockIn={handleAdminClockIn}
                     showNotification={showNotification} 
                 />
             )}

            {/* Modale Aggiunta Forms */}
            <AddFormModal 
                show={showAddFormModal}
                onClose={() => setShowAddFormModal(false)}
                workAreas={allWorkAreas}
                user={user}
                onDataUpdate={fetchData}
                currentUserRole={currentUserRole}
                userData={userData}
                showNotification={showNotification}
            />

            {/* NUOVO MODALE AGGIUNTA SPESA (REINSERITO) */}
            <AddExpenseModal 
                show={showAddExpenseModal}
                onClose={() => { setShowAddExpenseModal(false); setExpenseToEdit(null); }}
                user={user}
                userData={userData}
                showNotification={showNotification}
                expenseToEdit={expenseToEdit}
            />

            {/* MODALE PROCESSA SPESA (ADMIN) */}
            {expenseToProcess && (
                <ProcessExpenseModal 
                    show={true}
                    onClose={() => setExpenseToProcess(null)}
                    expense={expenseToProcess}
                    onConfirm={handleConfirmProcessExpense}
                    isProcessing={isActionLoading}
                />
            )}

            {/* Modale Aggiunta Dipendenti Squadra */}
            <AddEmployeeToAreaModal 
                show={showAddEmployeeModal}
                onClose={() => setShowAddEmployeeModal(false)}
                allEmployees={allEmployees}
                workAreas={allWorkAreas}
                userData={userData}
                showNotification={showNotification}
                onDataUpdate={fetchData}
            />
        </div>
    );
};

export default AdminDashboard;