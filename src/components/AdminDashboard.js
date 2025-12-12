// File: src/components/AdminDashboard.js
/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
     collection, getDocs, query, where,
     Timestamp, onSnapshot, updateDoc, doc, limit
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal'; 

// === IMPORTAZIONI PER EXPORT E FILESYSTEM ===
import { utils, write } from 'xlsx'; 
import { saveAs } from 'file-saver';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'; 

// ===========================================
// --- 1. CONFIGURAZIONE E UTILITIES ---
// ===========================================

const SUPER_ADMIN_EMAIL = "domenico.leoncino@tcsitalia.com"; 

const NotificationPopup = ({ message, type, onClose }) => {
    const baseClasses = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-xl text-white transition-opacity duration-300 w-11/12 max-w-sm text-center";
    const typeClasses = {
        success: "bg-green-600",
        error: "bg-red-600",
        info: "bg-blue-600"
    };

    return (
        <div className={`${baseClasses} ${typeClasses[type]}`}>
            <p className="font-bold text-lg mb-1">{type === 'error' ? '⚠️ Errore' : '✅ Successo'}</p>
            <p className="text-sm">{message}</p>
            <button onClick={onClose} className="absolute top-2 right-3 text-xl font-bold opacity-70">&times;</button>
        </div>
    );
};

const BackButton = ({ onClick }) => (
    <button 
        onClick={onClick}
        className="mb-4 inline-flex items-center text-indigo-600 font-bold text-lg bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-200 active:scale-95 transition-transform"
    >
        <span className="mr-2 text-xl">⬅️</span> Menu
    </button>
);

const renderField = (v, setV, l, n, t='text', opts=[]) => (
    <div className="mb-4"><label className="block text-sm font-bold text-gray-700 mb-1">{l}</label>{t==='select'?<select className="w-full border border-gray-300 rounded-lg p-3 bg-white text-base" value={v[n]||''} onChange={e=>setV({...v,[n]:e.target.value})}>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input type={t} className="w-full border border-gray-300 rounded-lg p-3 text-base" value={v[n]||''} onChange={e=>setV({...v,[n]:e.target.value})} />}</div>
);

// ===========================================
// --- 2. VISTE (MOBILE ONLY) ---
// ===========================================

// --- VISTA 1: MENU PRINCIPALE (HUB) ---
const HomeMenuView = ({ setView, currentUserRole, activeCount, totalHours, userName }) => {
    const menuItems = [
        { id: 'employees', label: '👥 Dipendenti', role: ['admin', 'preposto'], color: 'bg-blue-600', sub: 'Gestione Presenze' },
        { id: 'areas', label: '📍 Aree Cantiere', role: ['admin', 'preposto'], color: 'bg-teal-600', sub: 'Gestione Luoghi' },
        { id: 'reports', label: '📄 Report', role: ['admin', 'preposto'], color: 'bg-purple-600', sub: 'Storico e Export' },
        { id: 'admins', label: '🔑 Admin', role: ['admin'], color: 'bg-gray-700', sub: 'Gestione Ruoli' },
    ];

    return (
        <div className="flex flex-col space-y-4 w-full">
            <div className="bg-white w-full rounded-2xl shadow-sm p-5 border border-gray-100 text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-1">Ciao, {userName}</h2>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-green-50 p-3 rounded-xl border border-green-100"><p className="text-3xl font-bold text-green-700">{activeCount}</p><p className="text-xs text-green-600 font-bold uppercase">Presenti</p></div>
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100"><p className="text-3xl font-bold text-indigo-700">{totalHours}h</p><p className="text-xs text-indigo-600 font-bold uppercase">Ore Oggi</p></div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {menuItems.filter(item => item.role.includes(currentUserRole)).map(item => (
                    <button key={item.id} onClick={() => setView(item.id)} className={`w-full ${item.color} text-white text-left p-6 rounded-2xl shadow-md active:scale-95 transition-all relative overflow-hidden`}>
                        <div className="relative z-10 flex justify-between items-center">
                            <div><h3 className="text-2xl font-bold">{item.label}</h3><p className="text-white text-opacity-80 text-sm mt-1">{item.sub}</p></div>
                            <span className="text-4xl bg-white bg-opacity-20 rounded-full p-2">👉</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

// --- VISTA 2: DIPENDENTI (SOLO CARD) ---
const EmployeeManagementView = ({ employees, openModal, currentUserRole, searchTerm, setSearchTerm, adminEmployeeId, handleEmployeePauseClick }) => { 
    const [statusFilter, setStatusFilter] = useState('ALL'); 

    const filteredEmployees = employees.filter(emp => {
        const matchesSearch = searchTerm === '' || `${emp.name} ${emp.surname}`.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'PRESENT') return emp.activeEntry && emp.activeEntry.status !== 'In Pausa';
        if (statusFilter === 'PAUSE') return emp.activeEntry && emp.activeEntry.status === 'In Pausa';
        if (statusFilter === 'ABSENT') return !emp.activeEntry;
        return true;
    });

    const getStatusColor = (emp) => {
        if (!emp.activeEntry) return 'border-l-8 border-gray-300';
        if (emp.activeEntry.status === 'In Pausa') return 'border-l-8 border-yellow-400';
        return 'border-l-8 border-green-500';
    };

    return (
        <div className="w-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Dipendenti</h1>
            
            {/* Search & Filters */}
            <div className="flex flex-col gap-3 mb-6">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cerca nome..." className="w-full px-4 py-4 border border-gray-300 rounded-xl shadow-sm text-lg" />
                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                    {[{id: 'ALL', label: 'Tutti'}, {id: 'PRESENT', label: 'Presenti'}, {id: 'PAUSE', label: 'Pausa'}, {id: 'ABSENT', label: 'Assenti'}].map(f => (
                        <button key={f.id} onClick={() => setStatusFilter(f.id)} className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${statusFilter === f.id ? 'bg-gray-800 text-white border-transparent' : 'bg-white text-gray-600 border-gray-300'}`}>{f.label}</button>
                    ))}
                </div>
            </div>

            {/* LISTA CARD (MOBILE ONLY) */}
            <div className="space-y-4 pb-20">
                {filteredEmployees.map(emp => {
                    const isSelfClockIn = emp.id === adminEmployeeId;
                    const clockInType = isSelfClockIn ? 'manualClockIn' : 'adminClockIn'; 
                    const clockOutType = isSelfClockIn ? 'manualClockOut' : 'adminClockOut'; 
                    return (
                        <div key={emp.id} className={`bg-white rounded-xl shadow-md border border-gray-100 ${getStatusColor(emp)} p-5 relative w-full`}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-2xl font-extrabold text-gray-900 leading-tight">{emp.name} {emp.surname}</h3>
                                    <div className="text-sm font-medium mt-1">
                                        {emp.activeEntry ? <span className="text-gray-800 bg-gray-100 px-2 py-1 rounded">📍 {emp.activeEntry.areaName}</span> : <span className="text-gray-400 italic">🏠 Assente</span>}
                                    </div>
                                </div>
                                <div className="text-4xl">
                                    {emp.activeEntry ? (emp.activeEntry.status === 'In Pausa' ? '⏸️' : '✅') : ''}
                                </div>
                            </div>

                            <div className="mt-4">
                                {emp.activeEntry ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => openModal(clockOutType, emp)} disabled={emp.activeEntry.status === 'In Pausa'} className={`py-4 rounded-xl font-bold text-white text-xl shadow active:scale-95 transition-transform ${emp.activeEntry.status === 'In Pausa' ? 'bg-gray-300' : 'bg-red-600'}`}>USCITA</button>
                                        <button onClick={() => handleEmployeePauseClick(emp)} disabled={!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)} className={`py-4 rounded-xl font-bold text-white text-xl shadow active:scale-95 transition-transform ${!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end) ? 'bg-gray-300' : 'bg-yellow-500 text-yellow-900'}`}>PAUSA</button>
                                    </div>
                                ) : (
                                    <button onClick={() => openModal(clockInType, emp)} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform text-xl tracking-wide">ENTRATA</button>
                                )}
                            </div>
                            
                            {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                <div className="mt-4 pt-3 border-t border-gray-100 text-center">
                                     <button onClick={() => openModal('resetDevice', emp)} disabled={!emp.deviceIds?.length} className="text-sm text-gray-400 font-medium underline px-2 py-1 disabled:opacity-30">Reset ID Dispositivo</button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filteredEmployees.length === 0 && <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed">Nessun dipendente trovato.</div>}
            </div>
        </div>
    );
};

// --- VISTA 3: AREE (SOLO CARD) ---
const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
    <div className="w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Aree Cantiere</h1>
        <div className="space-y-3 pb-20">
            {workAreas.map(area => (
                <div key={area.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">{area.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">Pausa: {area.pauseDuration||0} min | Ore Tot: {area.totalHours||0}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => openModal(currentUserRole === 'admin' ? 'editArea' : 'editAreaPauseOnly', area)} className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg font-bold text-sm">Modifica</button>
                        {currentUserRole === 'admin' && <button onClick={() => openModal('deleteArea', area)} className="bg-red-100 text-red-700 px-3 py-2 rounded-lg font-bold text-sm">Elimina</button>}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// --- VISTA 4: ADMIN (SOLO CARD) ---
const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole }) => {
    if (currentUserRole !== 'admin') return <div className="text-red-500 font-bold text-center p-4">Accesso Negato</div>;
    const filteredAdmins = admins.filter(admin => admin.email !== superAdminEmail);
    return (
        <div className="w-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Admin & Preposti</h1>
            <div className="space-y-3 pb-20">
                {filteredAdmins.map(admin => (
                    <div key={admin.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{admin.name} {admin.surname}</h3>
                                <p className="text-sm text-gray-500">{admin.email}</p>
                                <span className="inline-block bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded mt-2 capitalize font-bold">{admin.role}</span>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button onClick={() => openModal('deleteAdmin', admin)} disabled={admin.email === user?.email} className="bg-red-100 text-red-700 px-3 py-2 rounded-lg font-bold text-xs disabled:opacity-50">Elimina</button>
                                {admin.role === 'preposto' && <button onClick={() => openModal('assignPrepostoAreas', admin)} className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg font-bold text-xs">Aree</button>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- VISTA 5: REPORT (CARD PER I RISULTATI) ---
const ReportView = ({ reports, dateRange, setDateRange, allWorkAreas, allEmployees, reportAreaFilter, setReportAreaFilter, reportEmployeeFilter, setReportEmployeeFilter, generateReport, isLoading, handleExportXml, handleReviewSkipBreak, hasSearched }) => { 
    
    // --- FUNZIONE EXCEL AGGIORNATA PER ANDROID ---
    const handleExportExcel = async () => {
        if (!reports || !reports.length) return;
        const data = reports.map(e => ({ 'Dipendente': e.employeeName, 'Area': e.areaName, 'Data': e.clockInDate, 'Entrata': e.clockInTimeFormatted, 'Uscita': e.clockOutTimeFormatted, 'Ore': e.duration?.toFixed(2), 'Pausa': e.pauseHours?.toFixed(2), 'Note': e.note }));
        
        // Genera Workbook
        const ws = utils.json_to_sheet(data); 
        const wb = utils.book_new(); 
        utils.book_append_sheet(wb, ws, "Report"); 
        
        const fileName = `Report_${dateRange.start}_${dateRange.end}.xlsx`;

        try {
            // 1. Genera Base64 per Android
            const excelBase64 = write(wb, { bookType: 'xlsx', type: 'base64' });

            // 2. Salva nei Documenti
            await Filesystem.writeFile({
                path: fileName,
                data: excelBase64,
                directory: Directory.Documents
            });

            alert(`✅ Excel salvato nei Documenti!\nFile: ${fileName}`);

        } catch (error) {
            console.error("Errore save Excel", error);
            // Fallback Web (PC)
            const wbout = write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            saveAs(blob, fileName);
        }
    };

    return (
        <div className="w-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Report</h1>
            <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-5 mb-6">
                <div className="grid grid-cols-1 gap-4 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Da</label><input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50" /></div>
                        <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">A</label><input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50" /></div>
                    </div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Area</label><select value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl bg-white"><option value="all">Tutte</option>{allWorkAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Dipendente</label><select value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl bg-white"><option value="all">Tutti</option>{allEmployees.map(e => <option key={e.id} value={e.id}>{e.name} {e.surname}</option>)}</select></div>
                </div>
                <button onClick={generateReport} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-md transition-all text-lg">{isLoading ? 'Caricamento...' : 'Genera Report'}</button>
            </div>

            {/* FEEDBACK SE VUOTO */}
            {hasSearched && reports.length === 0 && !isLoading && (
                <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed mb-10">
                    <p className="text-lg font-bold">Nessun dato trovato</p>
                    <p className="text-sm">Prova a cambiare le date o i filtri.</p>
                </div>
            )}

            {reports.length > 0 && (
                <div className="animate-fade-in-up pb-20">
                    <div className="flex gap-2 mb-4">
                        <button onClick={handleExportExcel} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold text-sm shadow-sm">Excel</button>
                        <button onClick={() => handleExportXml(reports)} className="flex-1 bg-gray-600 text-white py-3 rounded-xl font-bold text-sm shadow-sm">XML</button>
                    </div>
                    {/* Lista Risultati come Card */}
                    <div className="space-y-3">
                        {reports.map(r => (
                            <div key={r.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="font-bold text-gray-900">{r.employeeName}</span>
                                    <span className="font-bold text-blue-600">{r.duration?.toFixed(2)}h</span>
                                </div>
                                <div className="text-sm text-gray-500 flex justify-between">
                                    <span>{r.clockInDate}</span>
                                    <span>{r.clockInTimeFormatted} - {r.clockOutTimeFormatted}</span>
                                </div>
                                <div className="mt-2 text-right">
                                    {r.skippedBreak && r.skipBreakStatus === 'pending' ? <button onClick={() => handleReviewSkipBreak(r.id, 'approved')} className="text-xs bg-orange-100 text-orange-800 px-3 py-1 rounded-lg font-bold border border-orange-200">Verifica No Pausa</button> : (r.skippedBreak ? <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded">No Pausa (Appr.)</span> : <span className="text-xs text-gray-400">Standard</span>)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ===========================================
// --- 3. HELPER FORMS & MODALS ---
// ===========================================

const NewEmployeeForm = ({ onDataUpdate, user, setView, showNotification }) => {
    const [f, setF] = useState({controlloGpsRichiesto:true});
    const sub = async (e) => { e.preventDefault(); try { await httpsCallable(getFunctions(undefined,'europe-west1'),'createUser')({...f, role:'dipendente', createdBy:user.uid}); showNotification('Creato','success'); await onDataUpdate(); setView('employees'); } catch(err) { showNotification(err.message,'error'); }};
    return (<div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 className="font-bold text-xl mb-6">Nuovo Dipendente</h3><form onSubmit={sub}>{renderField(f,setF,'Nome','name')}{renderField(f,setF,'Cognome','surname')}{renderField(f,setF,'Email','email','email')}{renderField(f,setF,'Password','password','password')}<button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-md text-lg">Crea</button></form></div>);
};
const NewAreaForm = ({ onDataUpdate, setView, showNotification }) => {
    const [f, setF] = useState({radius:100});
    const sub = async (e) => { e.preventDefault(); try { await httpsCallable(getFunctions(undefined,'europe-west1'),'createWorkArea')({...f, latitude:Number(f.latitude), longitude:Number(f.longitude), radius:Number(f.radius), pauseDuration:Number(f.pauseDuration||0)}); showNotification('Creata','success'); await onDataUpdate(); setView('areas'); } catch(err) { showNotification(err.message,'error'); }};
    return (<div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 className="font-bold text-xl mb-6">Nuova Area</h3><form onSubmit={sub}>{renderField(f,setF,'Nome','name')}{renderField(f,setF,'Pausa (min)','pauseDuration','number')}{renderField(f,setF,'Lat','latitude','number')}{renderField(f,setF,'Lon','longitude','number')}{renderField(f,setF,'Raggio (m)','radius','number')}<button type="submit" className="w-full bg-teal-600 text-white py-4 rounded-xl font-bold shadow-md text-lg">Crea</button></form></div>);
};
const PrepostoAddEmployeeForm = ({ onDataUpdate, user, setView, showNotification, workAreas, allEmployees, userData }) => {
    const [f, setF] = useState({selectedPrepostoAreas:[]});
    const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
    const sub = async (e) => { e.preventDefault(); try { await httpsCallable(getFunctions(undefined,'europe-west1'),'prepostoAssignEmployeeToArea')({employeeId:f.selectedEmployee, areaIds:f.selectedPrepostoAreas}); showNotification('Assegnato','success'); await onDataUpdate(); setView('employees'); } catch(err) { showNotification(err.message,'error'); }};
    const toggleArea = (id) => { const curr = f.selectedPrepostoAreas||[]; setF({...f, selectedPrepostoAreas: curr.includes(id) ? curr.filter(x=>x!==id) : [...curr, id]}); };
    return (<div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 className="font-bold text-xl mb-6">Assegna Dipendente</h3><form onSubmit={sub}>{renderField(f,setF,'Dipendente','selectedEmployee','select',[{value:'',label:'--'},...allEmployees.map(e=>({value:e.id,label:e.name+' '+e.surname}))])}<div className="mb-6"><label className="font-bold text-sm block mb-2">Aree</label>{managedAreas.map(a=><div key={a.id} className="flex items-center p-3 border rounded-lg mb-2 hover:bg-gray-50"><input type="checkbox" checked={f.selectedPrepostoAreas?.includes(a.id)} onChange={()=>toggleArea(a.id)} className="w-5 h-5 text-indigo-600 mr-3"/><span className="font-medium">{a.name}</span></div>)}</div><button type="submit" className="w-full bg-teal-600 text-white py-4 rounded-xl font-bold shadow-md text-lg">Conferma</button></form></div>);
};
const NewAdminForm = ({ onDataUpdate, user, setView, showNotification }) => {
    const [f, setF] = useState({role: 'preposto', controlloGpsRichiesto: true});
    const sub = async (e) => { e.preventDefault(); try { await httpsCallable(getFunctions(undefined,'europe-west1'),'createUser')({...f, createdBy:user.uid}); showNotification('Creato','success'); await onDataUpdate(); setView('admins'); } catch(err) { showNotification(err.message,'error'); }};
    return (<div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 className="font-bold text-xl mb-6">Nuovo Admin</h3><form onSubmit={sub}>{renderField(f, setF, 'Nome', 'name')}{renderField(f, setF, 'Cognome', 'surname')}{renderField(f, setF, 'Email', 'email', 'email')}{renderField(f, setF, 'Password', 'password', 'password')}{renderField(f, setF, 'Ruolo', 'role', 'select', [{value:'preposto',label:'Preposto'},{value:'admin',label:'Admin'}])}<button type="submit" className="w-full bg-gray-800 text-white py-4 rounded-xl font-bold shadow-md text-lg">Crea</button></form></div>);
};

const ActionHeader = ({ view, currentUserRole, setView }) => {
    let btn = null;
    if (view === 'employees' && currentUserRole === 'admin') btn = { txt: '+ Nuovo Dipendente', act: () => setView('newEmployeeForm'), col: 'bg-indigo-600' };
    if (view === 'areas' && currentUserRole === 'admin') btn = { txt: '+ Nuova Area', act: () => setView('newAreaForm'), col: 'bg-teal-600' };
    if (view === 'employees' && currentUserRole === 'preposto') btn = { txt: '+ Assegna Dipendente', act: () => setView('prepostoAddEmployeeForm'), col: 'bg-teal-600' };
    if (view === 'admins' && currentUserRole === 'admin') btn = { txt: '+ Nuovo Admin', act: () => setView('newAdminForm'), col: 'bg-gray-800' };
    if (!btn) return null;
    return <div className="mb-4 flex justify-end"><button onClick={btn.act} className={`${btn.col} text-white font-bold py-3 px-5 rounded-xl shadow-md active:scale-95 transition-all text-sm`}>{btn.txt}</button></div>;
};

// ===========================================
// --- 4. MAIN COMPONENT ---
// ===========================================

const AdminDashboard = ({ user, handleLogout, userData }) => {
    const [view, setView] = useState('home'); 
    const [allEmployees, setAllEmployees] = useState([]); 
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeCount, setActiveCount] = useState(0);
    const [totalDayHours, setTotalDayHours] = useState('0.00');
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [notification, setNotification] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
    const [dateRange, setDateRange] = useState({ start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });
    const [reportAreaFilter, setReportAreaFilter] = useState('all');
    const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
    const [reports, setReports] = useState([]);
    const [hasSearched, setHasSearched] = useState(false); 

    const currentUserRole = userData?.role;
    const showNotification = useCallback((message, type='success') => { setNotification({message, type}); setTimeout(()=>setNotification(null), 4000); }, []);

    const fetchData = useCallback(async () => {
        if (!user || !userData) return;
        setIsLoading(true);
        try {
            const [areasSnap, empsSnap] = await Promise.all([ getDocs(collection(db, "work_areas")), getDocs(collection(db, "employees")) ]);
            setAllWorkAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setAllEmployees(empsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            if (currentUserRole === 'admin') {
                const adminSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["admin", "preposto"])));
                setAdmins(adminSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        } catch (e) { console.error(e); showNotification('Errore caricamento dati', 'error'); } finally { setIsLoading(false); }
    }, [user, userData, currentUserRole, showNotification]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const unsubActive = onSnapshot(query(collection(db, "time_entries"), where("status", "==", "clocked-in")), (snap) => {
            const actives = snap.docs.map(d => d.data());
            const filteredActives = currentUserRole === 'admin' ? actives : actives.filter(a => userData?.managedAreaIds?.includes(a.workAreaId));
            setActiveCount(filteredActives.length);
            setAllEmployees(prev => prev.map(emp => {
                const entry = actives.find(a => a.employeeId === emp.id);
                const area = allWorkAreas.find(a => a.id === entry?.workAreaId);
                return { ...emp, activeEntry: entry ? { ...entry, areaName: area?.name } : null };
            }));
        });
        const unsubHours = onSnapshot(query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(new Date(new Date().setHours(0,0,0,0))))), (snap) => {
            let mins = 0; const now = new Date();
            snap.docs.forEach(d => {
                const e = d.data();
                if(currentUserRole === 'preposto' && !userData?.managedAreaIds?.includes(e.workAreaId)) return;
                const end = e.clockOutTime ? e.clockOutTime.toDate() : (e.status === 'clocked-in' ? now : e.clockInTime.toDate());
                const dur = (end - e.clockInTime.toDate()) / 60000;
                if(dur > 0) mins += dur;
            });
            setTotalDayHours((mins/60).toFixed(2));
        });
        return () => { unsubActive(); unsubHours(); };
    }, [allWorkAreas, currentUserRole, userData]);

    const openModal = (type, item) => { setModalType(type); setSelectedItem(item); setShowModal(true); };
    const requestSort = (key) => setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending' });
    const managedEmployees = useMemo(() => {
        let list = currentUserRole === 'admin' ? allEmployees : allEmployees.filter(e => e.workAreaIds?.some(id => userData?.managedAreaIds?.includes(id)));
        if (sortConfig.key) list = [...list].sort((a,b) => { const valA = sortConfig.key === 'name' ? a.name : a[sortConfig.key]; const valB = sortConfig.key === 'name' ? b.name : b[sortConfig.key]; return (valA < valB ? -1 : 1) * (sortConfig.direction === 'ascending' ? 1 : -1); });
        return list;
    }, [allEmployees, currentUserRole, userData, sortConfig]);

    // --- GENERAZIONE REPORT POTENZIATA (CALCOLO MANUALE) ---
    const generateReport = async () => { 
        setIsLoading(true); 
        setHasSearched(true); 
        try { 
            const safeEmployeeFilter = reportEmployeeFilter === 'all' ? null : reportEmployeeFilter;
            const safeAreaFilter = reportAreaFilter === 'all' ? null : reportAreaFilter;

            const res = await httpsCallable(getFunctions(undefined, 'europe-west1'), 'generateTimeReport')({ 
                startDate: dateRange.start, 
                endDate: dateRange.end, 
                employeeIdFilter: safeEmployeeFilter, 
                areaIdFilter: safeAreaFilter 
            }); 
            
            // MAPPA E CALCOLA I DATI (Fix per campi vuoti)
            const mapped = res.data.reports.map(r => { 
                const emp = allEmployees.find(e => e.id === r.employeeId); 
                const area = allWorkAreas.find(a => a.id === r.workAreaId); 
                
                // Helper per leggere date (ISO, Timestamp, Seconds)
                const getMillis = (t) => {
                    if (!t) return null;
                    if (typeof t === 'string') return new Date(t).getTime(); 
                    if (t.toMillis) return t.toMillis(); 
                    if (t.seconds) return t.seconds * 1000; 
                    return new Date(t).getTime(); 
                };

                const inMillis = getMillis(r.clockInTime);
                const outMillis = getMillis(r.clockOutTime);

                // Formattazione
                const clockInDate = inMillis ? new Date(inMillis).toLocaleDateString('it-IT') : '---';
                const clockInTimeFormatted = inMillis ? new Date(inMillis).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : '---';
                const clockOutTimeFormatted = outMillis ? new Date(outMillis).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : '---';

                // Calcolo Pausa
                let pauseMinutes = 0;
                if (r.pauses && Array.isArray(r.pauses)) {
                    r.pauses.forEach(p => {
                        const pStart = getMillis(p.start);
                        const pEnd = getMillis(p.end);
                        if (pStart && pEnd) pauseMinutes += (pEnd - pStart) / 60000;
                    });
                }
                const pauseHours = pauseMinutes / 60;

                // Calcolo Durata Netta
                let duration = 0;
                if (inMillis && outMillis) {
                    const totalMinutes = (outMillis - inMillis) / 60000;
                    duration = (totalMinutes - pauseMinutes) / 60;
                } else if (r.duration) {
                    duration = r.duration; // Fallback
                }

                // Oggetto finale pieno
                return { 
                    ...r, 
                    employeeName: emp ? `${emp.name} ${emp.surname}` : (r.employeeName || 'Sconosciuto'), 
                    areaName: area ? area.name : (r.workAreaId || 'Sconosciuta'),
                    clockInDate: clockInDate, 
                    clockInTimeFormatted: clockInTimeFormatted,
                    clockOutTimeFormatted: clockOutTimeFormatted,
                    pauseHours: pauseHours,
                    duration: duration
                }; 
            }); 
            setReports(mapped); 
        } catch(e) { 
            console.error(e);
            showNotification(e.message, 'error'); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const handleReviewSkipBreak = async (entryId, decision) => { if(!window.confirm("Confermi?")) return; try { await httpsCallable(getFunctions(undefined, 'europe-west1'), 'reviewSkipBreakRequest')({ timeEntryId: entryId, decision, adminId: user.uid }); showNotification('Fatto', 'success'); generateReport(); } catch(e) { showNotification(e.message, 'error'); }};
    
    // --- EXPORT XML AGGIORNATO (Fix Android) ---
    const handleExportXml = useCallback(async (dataToExport) => { 
        if (!dataToExport || dataToExport.length === 0) return showNotification("Nessun dato.", 'info'); 
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<Report>\n'; 
        dataToExport.forEach(entry => { xmlString += ` <Entry><Dipendente>${entry.employeeName}</Dipendente><Area>${entry.areaName}</Area><Entrata>${entry.clockInTimeFormatted}</Entrata><Uscita>${entry.clockOutTimeFormatted}</Uscita></Entry>\n`; }); 
        xmlString += '</Report>'; 
        const fileName = `Report_${dateRange.start}.xml`;
        
        try {
            await Filesystem.writeFile({
                path: fileName,
                data: xmlString,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            showNotification(`✅ XML salvato nei Documenti`, 'success');
        } catch(e) { 
            console.error(e);
            const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
            saveAs(blob, fileName); 
        }
    }, [showNotification, dateRange.start]);

    const handleResetEmployeeDevice = async (emp) => { if(window.confirm('Reset device?')) { await updateDoc(doc(db,'employees',emp.id), {deviceIds:[]}); showNotification('Device resettato','success'); }};
    const handleEmployeePauseClick = async (emp) => { const area = allWorkAreas.find(a => a.id === emp.activeEntry.workAreaId); if(!area?.pauseDuration) return showNotification('No pausa area', 'info'); if(!window.confirm(`Pausa ${area.pauseDuration}min?`)) return; try { await httpsCallable(getFunctions(undefined,'europe-west1'),'applyAutoPauseEmployee')({timeEntryId:emp.activeEntry.id, durationMinutes: area.pauseDuration, deviceId:'MANUAL', employeeIdToUpdate: emp.id}); showNotification('Pausa ok','success'); } catch(e){ showNotification(e.message,'error'); }};

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col w-full">
            {notification && <NotificationPopup message={notification.message} type={notification.type} onClose={()=>setNotification(null)} />}
            
            <header className="bg-white w-full shadow-sm sticky top-0 z-40 border-b border-gray-100">
                <div className="w-full px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <CompanyLogo className="h-8" />
                        <span className="font-bold text-gray-700 text-sm hidden sm:inline-block">
                            {userData?.name || 'Utente'}
                        </span>
                    </div>
                    <button onClick={handleLogout} className="text-sm font-bold text-red-500 hover:bg-red-50 px-3 py-1 rounded-full transition-colors">
                        Esci
                    </button>
                </div>
            </header>

            <main className="flex-1 w-full px-4 py-6 mx-auto">
                {view === 'home' && <HomeMenuView setView={setView} currentUserRole={currentUserRole} activeCount={activeCount} totalHours={totalDayHours} userName={userData?.name || 'Utente'} />}
                {view !== 'home' && (
                    <div className="animate-fade-in-up">
                        <BackButton onClick={() => setView('home')} />
                        <ActionHeader view={view} currentUserRole={currentUserRole} setView={setView} />
                        {view === 'employees' && <EmployeeManagementView employees={managedEmployees} openModal={openModal} currentUserRole={currentUserRole} requestSort={requestSort} sortConfig={sortConfig} searchTerm={searchTerm} setSearchTerm={setSearchTerm} handleResetEmployeeDevice={handleResetEmployeeDevice} adminEmployeeId={null} handleEmployeePauseClick={handleEmployeePauseClick} />}
                        {view === 'areas' && <AreaManagementView workAreas={currentUserRole==='admin'?allWorkAreas:allWorkAreas.filter(a=>userData?.managedAreaIds?.includes(a.id))} openModal={openModal} currentUserRole={currentUserRole} />}
                        {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={SUPER_ADMIN_EMAIL} currentUserRole={currentUserRole} />}
                        {view === 'reports' && (
                            <ReportView 
                                reports={reports} 
                                dateRange={dateRange} 
                                setDateRange={setDateRange} 
                                allWorkAreas={currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))} 
                                allEmployees={managedEmployees} 
                                reportAreaFilter={reportAreaFilter} 
                                setReportAreaFilter={setReportAreaFilter} 
                                reportEmployeeFilter={reportEmployeeFilter} 
                                setReportEmployeeFilter={setReportEmployeeFilter} 
                                generateReport={generateReport} 
                                isLoading={isLoading} 
                                handleExportXml={handleExportXml} 
                                handleReviewSkipBreak={handleReviewSkipBreak} 
                                hasSearched={hasSearched} 
                            />
                        )}
                        {view === 'newEmployeeForm' && <NewEmployeeForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} />}
                        {view === 'newAreaForm' && <NewAreaForm onDataUpdate={fetchData} setView={setView} showNotification={showNotification} />}
                        {view === 'prepostoAddEmployeeForm' && <PrepostoAddEmployeeForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} workAreas={allWorkAreas} allEmployees={allEmployees} userData={userData} />}
                        {view === 'newAdminForm' && <NewAdminForm onDataUpdate={fetchData} user={user} setView={setView} showNotification={showNotification} />}
                    </div>
                )}
            </main>
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={allWorkAreas} onDataUpdate={fetchData} user={user} superAdminEmail={SUPER_ADMIN_EMAIL} allEmployees={allEmployees} currentUserRole={currentUserRole} userData={userData} showNotification={showNotification} />}
        </div>
    );
};

export default AdminDashboard;