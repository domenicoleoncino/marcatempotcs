// File: src/js/components/AdminModal.js
/* eslint-disable no-unused-vars */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, addDoc, collection, Timestamp, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, user, allEmployees, userData, showNotification, onAdminApplyPause, setModalType, activeEmployeesDetails }) => {

    const [formData, setFormData] = useState({});
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // STATO PER GESTIRE LA SCELTA TRA ARCHIVIA E ELIMINA TOTALE
    const [isHardDelete, setIsHardDelete] = useState(false);

    // --- EFFECT: Inizializzazione Dati ---
    useEffect(() => {
        setFormData({});
        setError('');
        setIsLoading(false);
        setIsHardDelete(false); // Reset della scelta

        const now = new Date();
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTimeISO = `${yyyy}-${MM}-${dd}T${HH}:${mm}`;
        const todayDate = `${yyyy}-${MM}-${dd}`;

        // -- Inizializzazioni specifiche per tipo --
        if (type === 'newEmployee') {
            setFormData({ name: '', surname: '', email: '', password: '', controlloGpsRichiesto: true });
        }
        else if (type === 'newArea') {
            setFormData({ name: '', pauseDuration: 0, latitude: '', longitude: '', radius: 100 });
        }
        else if (type === 'newAdmin') {
            setFormData({ name: '', surname: '', email: '', password: '', phone: '', role: 'preposto', controlloGpsRichiesto: true });
        }
        // GESTIONE RECUPERO DIMENTICANZA (manualEntry)
        else if (type === 'manualEntryForm' || type === 'manualEntry') { 
             setFormData({
                 employeeId: item ? item.id : '',
                 workAreaId: '',
                 date: todayDate,
                 startTime: '08:00',
                 endTime: '17:00',
                 skippedBreak: false // <--- AGGIUNTO: Inizializzazione campo No Pausa
             });
        }
        // GESTIONE GIUSTIFICATIVI/ASSENZE (justification)
        else if (type === 'absenceEntryForm' || type === 'justification') { 
             setFormData({
                 employeeId: item ? item.id : '',
                 startDate: todayDate,
                 endDate: todayDate,
                 type: 'Ferie',
                 note: ''
             });
        }
        else if (type === 'bypassRestPeriod') { 
             setFormData({ reason: '' });
        }
        else if (type === 'editAreaPauseOnly') {
             setFormData({ pauseDuration: item?.pauseDuration || 0 });
        }
        else if (item) {
            if (['adminClockIn', 'manualClockIn', 'manualClockOut', 'adminClockOut'].includes(type)) {
                const employeeId = item.id; 
                let availableAreas = [];
                if (userData?.role === 'admin') {
                    availableAreas = workAreas;
                } else if (userData?.role === 'preposto') {
                    const managedAreaIds = userData?.managedAreaIds || [];
                    availableAreas = workAreas.filter(wa => managedAreaIds.includes(wa.id));
                } else {
                    availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                }
                
                const isClockOut = type === 'manualClockOut' || type === 'adminClockOut';
                if (availableAreas.length === 0 && !isClockOut) {
                     setError("Nessuna area disponibile. Contatta l'amministratore.");
                     setIsLoading(true);
                }

                setFormData({ 
                    selectedEmployeeId: employeeId, 
                    selectedAreaId: availableAreas.length > 0 ? availableAreas[0].id : '', 
                    manualTime: currentTimeISO, 
                    note: '', 
                });
            } 
            else if (type === 'editEmployee') {
                setFormData({
                    name: item.name,
                    surname: item.surname,
                    email: item.email, 
                    controlloGpsRichiesto: item.controlloGpsRichiesto ?? true
                });
            } else if (type === 'editArea') {
                setFormData({
                    name: item.name,
                    pauseDuration: item.pauseDuration || 0,
                    latitude: item.latitude || '',
                    longitude: item.longitude || '',
                    radius: item.radius || ''
                });
            } else if (type === 'assignArea') {
                setFormData({ selectedAreas: item.workAreaIds || [] });
            } else if (type === 'assignPrepostoAreas') { 
                setFormData({
                    selectedAreas: item.managedAreaIds || [],
                    controlloGpsRichiesto: item.controlloGpsRichiesto ?? true
                });
            } else if (type === 'assignEmployeeToPrepostoArea') {
                const managedAreaIds = userData?.managedAreaIds || [];
                const preExistingAssignments = (item.workAreaIds || []).filter(id => managedAreaIds.includes(id));
                setFormData({ selectedPrepostoAreas: preExistingAssignments });
            }
        }
    }, [item, type, workAreas, userData, user?.uid]);

    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            if (name === 'selectedAreas' || name === 'selectedPrepostoAreas') {
                const currentSelection = formData[name] || [];
                if (checked) setFormData(prev => ({ ...prev, [name]: [...currentSelection, value] }));
                else setFormData(prev => ({ ...prev, [name]: currentSelection.filter(id => id !== value) }));
            } else {
                setFormData(prev => ({ ...prev, [name]: checked }));
            }
        } else if (e.target.multiple) {
            const values = Array.from(e.target.selectedOptions).map(option => option.value);
            setFormData(prev => ({...prev, [name]: values}));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const inputStyle = {
        display: 'block', width: '100%', padding: '10px 12px', fontSize: '14px', lineHeight: '1.5',
        color: '#374151', backgroundColor: '#fff', backgroundImage: 'none', border: '1px solid #d1d5db',
        borderRadius: '6px', marginTop: '6px', boxSizing: 'border-box'
    };
    const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '4px' };

    const renderFieldLocal = (label, name, inputType = 'text', options = [], required = true, disabled = false, helpText = '') => (
        <div className="mb-4">
            <label htmlFor={name} style={labelStyle}>{label}</label>
            {inputType === 'select' ? (
                 <select id={name} name={name} value={formData[name] ?? ''} onChange={handleChange} required={required} disabled={disabled} style={{...inputStyle, backgroundColor: disabled ? '#f3f4f6' : '#fff'}}>
                     {(!required || options.length > 0) && <option value="">{options.length > 0 ? '-- Seleziona --' : '-- Nessuna Opzione --'}</option>}
                     {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                 </select>
            ) : (
                <input id={name} name={name} type={inputType} value={formData[name] ?? ''} onChange={handleChange} step={inputType === 'number' ? 'any' : undefined} required={required} disabled={disabled} placeholder={helpText} style={{...inputStyle, backgroundColor: disabled ? '#f3f4f6' : '#fff'}} />
            )}
        </div>
    );

    const renderSingleCheckboxLocal = (label, name, description = '') => (
        <div className="flex items-start py-3">
            <div className="flex items-center h-5">
                <input id={name} name={name} type="checkbox" checked={!!formData[name]} onChange={handleChange} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            </div>
            <div className="ml-3 text-sm">
                <label htmlFor={name} style={{ fontWeight: '600', color: '#111827', cursor: 'pointer' }}>{label}</label>
                {description && <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>{description}</p>}
            </div>
        </div>
    );

    const renderCheckboxes = (label, name, items, disabled = false) => (
        <div className="mb-4">
            <label style={labelStyle}>{label}</label>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px', backgroundColor: '#f9fafb' }}>
                {items && items.length > 0 ? [...items].sort((a, b) => a.name.localeCompare(b.name)).map(it => (
                    <div key={it.id} className="flex items-center mb-2 last:mb-0">
                        <input id={`${name}-${it.id}`} name={name} type="checkbox" value={it.id} checked={(formData[name] || []).includes(it.id)} onChange={handleChange} disabled={disabled} style={{ width: '16px', height: '16px', marginRight: '8px' }} />
                        <label htmlFor={`${name}-${it.id}`} style={{ fontSize: '14px', color: disabled ? '#9ca3af' : '#374151' }}>{it.name}</label>
                    </div>
                )) : <p className="text-xs text-gray-500">Nessuna opzione disponibile.</p>}
            </div>
        </div>
    );

    // --- SUBMIT ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        
        try {
            switch (type) {
                // --- CREAZIONI ---
                case 'newEmployee':
                    const cleanEmail = formData.email ? formData.email.trim() : '';
                    const cleanPassword = formData.password ? formData.password.trim() : '';

                    if (cleanPassword.length < 6) throw new Error("La password deve avere almeno 6 caratteri.");
                    
                    const createEmp = httpsCallable(functions, 'createUser');
                    await createEmp({ 
                        name: formData.name,
                        surname: formData.surname,
                        email: cleanEmail,      
                        password: cleanPassword, 
                        controlloGpsRichiesto: formData.controlloGpsRichiesto,
                        role: 'dipendente', 
                        createdBy: user.uid 
                    });
                    break;

                case 'newArea':
                     const lat = Number(formData.latitude); const lon = Number(formData.longitude); const rad = Number(formData.radius);
                     if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) throw new Error('Dati geografici non validi.');
                     const createArea = httpsCallable(functions, 'createWorkArea');
                     await createArea({ name: formData.name, pauseDuration: Number(formData.pauseDuration || 0), latitude: lat, longitude: lon, radius: rad });
                     break;

                case 'newAdmin':
                    const cleanAdminEmail = formData.email ? formData.email.trim() : '';
                    const cleanAdminPassword = formData.password ? formData.password.trim() : '';

                    if (cleanAdminPassword.length < 6) throw new Error("La password deve avere almeno 6 caratteri.");
                    
                    const createAdm = httpsCallable(functions, 'createUser');
                    await createAdm({ 
                        name: formData.name,
                        surname: formData.surname,
                        email: cleanAdminEmail,     
                        password: cleanAdminPassword, 
                        phone: formData.phone,
                        role: formData.role,
                        controlloGpsRichiesto: formData.controlloGpsRichiesto,
                        createdBy: user.uid 
                    });
                    break;
                
                // --- OPERAZIONI SPECIALI ---
                case 'manualEntryForm':
                case 'manualEntry': 
                     const startDateTime = new Date(`${formData.date}T${formData.startTime}`);
                     const endDateTime = new Date(`${formData.date}T${formData.endTime}`);
                     if (endDateTime <= startDateTime) throw new Error("L'uscita deve essere dopo l'entrata.");
                     
                     // --- MODIFICA: Salvataggio campi pausa ---
                     await addDoc(collection(db, "time_entries"), {
                         employeeId: formData.employeeId, 
                         workAreaId: formData.workAreaId,
                         clockInTime: Timestamp.fromDate(startDateTime), 
                         clockOutTime: Timestamp.fromDate(endDateTime),
                         status: 'clocked-out', 
                         isManual: true, 
                         note: 'Recupero dimenticanza (Admin)', 
                         pauses: [],
                         skippedBreak: formData.skippedBreak, // Salva se ha saltato la pausa
                         skipBreakStatus: formData.skippedBreak ? 'approved' : 'none' // Se saltata, è approvata
                     });
                     break;
                     
                case 'absenceEntryForm':
                case 'justification': 
                     const start = new Date(formData.startDate); const end = new Date(formData.endDate);
                     if (end < start) throw new Error("Data fine precedente a data inizio.");
                     const batch = writeBatch(db); const tRef = collection(db, "time_entries");
                     let current = new Date(start);
                     while (current <= end) {
                         const evtDate = new Date(current); evtDate.setHours(12,0,0,0);
                         const newDoc = doc(tRef);
                         batch.set(newDoc, {
                             employeeId: formData.employeeId, workAreaId: null,
                             clockInTime: Timestamp.fromDate(evtDate), clockOutTime: Timestamp.fromDate(evtDate),
                             status: 'clocked-out', isManual: true, isAbsence: true,
                             absenceType: formData.type, note: formData.note || formData.type, pauses: []
                         });
                         current.setDate(current.getDate() + 1);
                     }
                     await batch.commit();
                     break;

                // --- MODIFICHE ---
                case 'editEmployee':
                    if (!formData.name || !formData.surname) throw new Error('Nome/Cognome obbligatori.');
                    await updateDoc(doc(db, "employees", item.id), {
                        name: formData.name, surname: formData.surname, controlloGpsRichiesto: formData.controlloGpsRichiesto
                    });
                    break;
                
                // --- GESTIONE CANCELLAZIONE (ARCHIVIA vs ELIMINA TUTTO) ---
                case 'deleteEmployee':
                    if (isHardDelete) {
                        const entriesQuery = query(collection(db, "time_entries"), where("employeeId", "==", item.id));
                        const snapshot = await getDocs(entriesQuery);
                        
                        const deleteBatch = writeBatch(db);
                        let count = 0;
                        let batches = [deleteBatch];

                        snapshot.docs.forEach((docSnapshot) => {
                            if (count >= 400) { 
                                batches.push(writeBatch(db));
                                count = 0;
                            }
                            batches[batches.length - 1].delete(docSnapshot.ref);
                            count++;
                        });

                        for (const b of batches) {
                            await b.commit();
                        }

                        if (item.userId) {
                            const deleteUser = httpsCallable(functions, 'deleteUserAndEmployee');
                            await deleteUser({ userId: item.userId });
                        } else {
                            await deleteDoc(doc(db, "employees", item.id));
                        }

                    } else {
                        await updateDoc(doc(db, "employees", item.id), {
                            isDeleted: true,
                            deviceIds: [],
                            deletedAt: Timestamp.now()
                        });
                    }
                    break;

                case 'restoreEmployee':
                    await updateDoc(doc(db, "employees", item.id), {
                        isDeleted: false,      
                        deletedAt: null
                    });
                    break;

                case 'deleteAdmin':
                    if (item.id) { 
                         const dAdmin = httpsCallable(functions, 'deleteUserAndEmployee');
                         await dAdmin({ userId: item.id });
                    } else {
                        throw new Error("ID utente mancante.");
                    }
                    break;

                case 'resetDevice':
                    await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                    break;
                case 'editArea':
                    await updateDoc(doc(db, "work_areas", item.id), { 
                        name: formData.name, 
                        pauseDuration: Number(formData.pauseDuration || 0), 
                        latitude: Number(formData.latitude), 
                        longitude: Number(formData.longitude), 
                        radius: Number(formData.radius) 
                    });
                    break;
                case 'editAreaPauseOnly':
                    await updateDoc(doc(db, "work_areas", item.id), { pauseDuration: Number(formData.pauseDuration || 0) });
                    break;
                case 'deleteArea':
                    await deleteDoc(doc(db, "work_areas", item.id));
                    break;
                case 'assignArea':
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.selectedAreas || [] });
                    break;
                case 'assignPrepostoAreas':
                    await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.selectedAreas || [], controlloGpsRichiesto: formData.controlloGpsRichiesto });
                    break;
                case 'assignEmployeeToPrepostoArea':
                case 'prepostoAddEmployeeToAreas': 
                    const pAssign = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
                    await pAssign({ employeeId: item?.id || formData.selectedEmployee, areaIds: formData.selectedPrepostoAreas || [] });
                    break;
                case 'manualClockIn':
                case 'adminClockIn': 
                case 'manualClockOut':
                case 'adminClockOut':
                    const isClockIn = type.includes('In');
                    const isClockOut = type.includes('Out');
                    if (!formData.manualTime) throw new Error("Orario obbligatorio.");
                    const utcIso = new Date(formData.manualTime).toISOString();
                    const clockFn = httpsCallable(functions, isClockIn ? 'manualClockIn' : 'manualClockOut');
                    await clockFn({
                        employeeId: formData.selectedEmployeeId, 
                        workAreaId: isClockIn ? formData.selectedAreaId : undefined,
                        timestamp: utcIso,
                        note: formData.note, 
                        adminId: user.uid,
                        timezone: clientTimezone,
                        entryId: isClockOut ? item.activeEntry?.id : undefined
                    });
                    break;
                case 'applyPredefinedPause':
                    if (onAdminApplyPause) {
                        await onAdminApplyPause(item);
                        setIsLoading(false); 
                        return;
                    }
                    break;
                default: break;
            }
            showNotification('Operazione completata con successo.', 'success');
            if (onDataUpdate) await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderModalBody = () => {
        const employeeName = item?.name ? `${item.name} ${item.surname}` : 'Utente';
        const roleOptions = [{value: 'preposto', label: 'Preposto'}, {value: 'admin', label: 'Admin'}];
        const absenceTypes = [
            { value: 'Ferie', label: '🏖️ Ferie' }, { value: 'Malattia', label: '🤒 Malattia' },
            { value: 'Permesso', label: '🕒 Permesso' }, { value: 'Legge 104', label: '♿ Legge 104' },
            { value: 'Infortunio', label: '🚑 Infortunio' }, { value: 'Assenza Ingiustificata', label: '❌ Assenza Ingiustificata' },
            { value: 'Altro', label: '📝 Altro' }
        ];

        switch (type) {
            // --- NUOVO MENU GESTIONE DIPENDENTE ---
            case 'employeeActions':
                // Per avere lo stato aggiornato, cerchiamo il dipendente fresco nella lista activeEmployeesDetails
                // che viene passata da AdminDashboard e si aggiorna in tempo reale.
                const activeEntry = activeEmployeesDetails ? activeEmployeesDetails.find(d => d.employeeId === item.id) : null;
                const isClockedIn = !!activeEntry && !activeEntry.isAbsence;
                const isPaused = isClockedIn && activeEntry.status === 'In Pausa';
                const hasCompletedPause = activeEntry?.hasCompletedPause;

                // Stile bottone menu
                const menuBtnStyle = {
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '16px', marginBottom: '10px',
                    backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px',
                    fontSize: '16px', fontWeight: '600', color: '#374151', cursor: 'pointer',
                    transition: 'background 0.2s'
                };

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        
                        {/* SEZIONE 1: OPERATIVITÀ GIORNALIERA */}
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '5px' }}>Azioni Rapide</p>
                        
                        {isClockedIn ? (
                            <>
                                <button type="button" onClick={() => setModalType('manualClockOut')} style={{...menuBtnStyle, backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca'}}>
                                    <span>🚪 Timbra Uscita</span>
                                    <span>➔</span>
                                </button>
                                
                                {isPaused ? (
                                    <button type="button" onClick={() => onAdminApplyPause({id: item.id, activeEntry: activeEntry})} style={{...menuBtnStyle, backgroundColor: '#dcfce7', color: '#166534', borderColor: '#86efac'}}>
                                        <span>▶️ Riprendi Lavoro (Fine Pausa)</span>
                                        <span>➔</span>
                                    </button>
                                ) : (
                                    hasCompletedPause ? (
                                        <button type="button" disabled style={{...menuBtnStyle, backgroundColor: '#e5e7eb', color: '#9ca3af', borderColor: '#d1d5db', cursor: 'not-allowed', opacity: 0.7}}>
                                            <span>✅ Pausa Eseguita</span>
                                            <span>✓</span>
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => onAdminApplyPause({id: item.id, activeEntry: activeEntry})} style={{...menuBtnStyle, backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a'}}>
                                            <span>☕ Metti in Pausa</span>
                                            <span>➔</span>
                                        </button>
                                    )
                                )}
                            </>
                        ) : (
                             <button type="button" onClick={() => setModalType('manualClockIn')} style={{...menuBtnStyle, backgroundColor: '#dcfce7', color: '#166534', borderColor: '#86efac'}}>
                                <span>📍 Timbra Entrata (Manuale)</span>
                                <span>➔</span>
                            </button>
                        )}

                        {/* SEZIONE 2: CORREZIONI */}
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', margin: '10px 0 5px' }}>Correzioni & Ore</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button type="button" onClick={() => setModalType('manualEntryForm')} style={{ ...menuBtnStyle, fontSize: '14px', padding: '12px', justifyContent: 'center', textAlign: 'center' }}>
                                🕒 +Ore/Dimenticanza
                            </button>
                            <button type="button" onClick={() => setModalType('absenceEntryForm')} style={{ ...menuBtnStyle, fontSize: '14px', padding: '12px', justifyContent: 'center', textAlign: 'center' }}>
                                🏖️ Giustifica/Assenza
                            </button>
                        </div>

                        {/* SEZIONE 3: AMMINISTRAZIONE */}
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', margin: '10px 0 5px' }}>Profilo Utente</p>
                        
                        <button type="button" onClick={() => setModalType('editEmployee')} style={menuBtnStyle}>
                            <span>✏️ Modifica Dati</span>
                            <span>➔</span>
                        </button>
                        
                        <button type="button" onClick={() => setModalType('assignArea')} style={menuBtnStyle}>
                            <span>🗺️ Assegna Aree</span>
                            <span>➔</span>
                        </button>

                        <button type="button" onClick={() => setModalType('resetDevice')} style={{...menuBtnStyle, color: '#dc2626'}}>
                            <span>📱 Reset ID Dispositivo</span>
                            <span>⚠️</span>
                        </button>

                         <button type="button" onClick={() => setModalType('deleteEmployee')} style={{...menuBtnStyle, backgroundColor: '#fff1f2', color: '#be123c', borderColor: '#fda4af'}}>
                            <span>📁 Archivia / Elimina</span>
                            <span>🗑️</span>
                        </button>
                    </div>
                );

            case 'newEmployee':
                return (
                    <>
                        <div style={{ padding: '10px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', marginBottom: '15px' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#c2410c', fontWeight: 'bold' }}>⚠️ ATTENZIONE SPAM</p>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9a3412' }}>
                                Le email automatiche (es. reset password) finiscono spesso nella <b>Posta Indesiderata/SPAM</b>. Avvisa il dipendente di controllare lì!
                            </p>
                        </div>
                        {renderFieldLocal('Nome', 'name')}
                        {renderFieldLocal('Cognome', 'surname')}
                        {renderFieldLocal('Email', 'email', 'email')}
                        {renderFieldLocal('Password (min 6)', 'password', 'text')}
                        {renderSingleCheckboxLocal('Controllo GPS', 'controlloGpsRichiesto')}
                    </>
                );
            case 'newArea':
                return <>{renderFieldLocal('Nome Area', 'name')}{renderFieldLocal('☕Pausa (min)', 'pauseDuration', 'number')}{renderFieldLocal('Latitudine', 'latitude', 'number')}{renderFieldLocal('Longitudine', 'longitude', 'number')}{renderFieldLocal('🧭Raggio (metri)(inserire almeno 100)', 'radius', 'number')}</>;
            case 'newAdmin':
                return (
                    <>
                        <div style={{ padding: '10px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', marginBottom: '15px' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#c2410c', fontWeight: 'bold' }}>⚠️ ATTENZIONE SPAM</p>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9a3412' }}>
                                Avvisa l'utente di controllare la cartella <b>SPAM</b> per la mail di benvenuto.
                            </p>
                        </div>
                        {renderFieldLocal('Nome', 'name')}
                        {renderFieldLocal('Cognome', 'surname')}
                        {renderFieldLocal('Email', 'email', 'email')}
                        {renderFieldLocal('Password', 'password')}
                        {renderFieldLocal('Telefono (Opz)', 'phone')}
                        {renderFieldLocal('Ruolo', 'role', 'select', roleOptions)}
                        {renderSingleCheckboxLocal('Controllo GPS', 'controlloGpsRichiesto')}
                    </>
                );
            case 'editEmployee':
                return <>{renderFieldLocal('Nome', 'name')}{renderFieldLocal('Cognome', 'surname')}{renderFieldLocal('Email (Non modificabile)', 'email', 'email', [], false, true)}{renderSingleCheckboxLocal('Controllo GPS', 'controlloGpsRichiesto')}</>;
            case 'editArea':
                return <>{renderFieldLocal('Nome', 'name')}{renderFieldLocal('Pausa (min)', 'pauseDuration', 'number')}{renderFieldLocal('Lat', 'latitude', 'number')}{renderFieldLocal('Lon', 'longitude', 'number')}{renderFieldLocal('Raggio', 'radius', 'number')}</>;
            case 'editAreaPauseOnly':
                return <>{renderFieldLocal('Minuti Pausa', 'pauseDuration', 'number')}</>;
            case 'assignArea':
                return renderCheckboxes('Aree Assegnate', 'selectedAreas', workAreas);
            case 'assignPrepostoAreas':
                return <>{renderCheckboxes('Aree Gestite', 'selectedAreas', workAreas)}{renderSingleCheckboxLocal('Controllo GPS', 'controlloGpsRichiesto')}</>;
            case 'prepostoAddEmployeeToAreas':
                const empOpts = allEmployees.map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }));
                const myAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                return <>{renderFieldLocal('Dipendente', 'selectedEmployee', 'select', empOpts)}{renderCheckboxes('Aree Competenza', 'selectedPrepostoAreas', myAreas)}</>;
            case 'assignEmployeeToPrepostoArea':
                const pAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                return renderCheckboxes('Aree Competenza', 'selectedPrepostoAreas', pAreas);
            case 'manualEntryForm':
            case 'manualEntry': 
                // Se è preposto, mostra solo i suoi dipendenti nel menu a tendina
                let empForManual = allEmployees;
                if (userData?.role === 'preposto') {
                    const managedIds = userData?.managedAreaIds || [];
                    empForManual = allEmployees.filter(e => e.workAreaIds && e.workAreaIds.some(id => managedIds.includes(id)));
                }
                const allEmpOpts = empForManual.map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }));
                
                const allAreaOpts = (userData.role === 'admin' ? workAreas : workAreas.filter(wa => userData.managedAreaIds?.includes(wa.id))).map(a => ({ value: a.id, label: a.name }));
                
                return (
                    <>
                         {item ? renderFieldLocal('Dipendente', 'employeeId', 'select', allEmpOpts, true, true) : renderFieldLocal('Dipendente', 'employeeId', 'select', allEmpOpts)}
                         {renderFieldLocal('Area', 'workAreaId', 'select', allAreaOpts)}
                         {renderFieldLocal('Data', 'date', 'date')}
                         <div className="grid grid-cols-2 gap-4">
                             {renderFieldLocal('Entrata', 'startTime', 'time')}
                             {renderFieldLocal('Uscita', 'endTime', 'time')}
                         </div>
                         {/* --- AGGIUNTO: Checkbox per No Pausa --- */}
                         {renderSingleCheckboxLocal('Non ha fatto pausa (Calcola ore piene)', 'skippedBreak')}
                    </>
                );
            case 'absenceEntryForm':
            case 'justification': 
                // Se è preposto, mostra solo i suoi dipendenti nel menu a tendina
                let empForAbsence = allEmployees;
                if (userData?.role === 'preposto') {
                    const managedIds = userData?.managedAreaIds || [];
                    empForAbsence = allEmployees.filter(e => e.workAreaIds && e.workAreaIds.some(id => managedIds.includes(id)));
                }
                const empOptsAbs = empForAbsence.map(e => ({ value: e.id, label: `${e.name} ${e.surname}` }));
                
                return (
                    <>
                        {item ? renderFieldLocal('Dipendente', 'employeeId', 'select', empOptsAbs, true, true) : renderFieldLocal('Dipendente', 'employeeId', 'select', empOptsAbs)}
                        {renderFieldLocal('Tipo Assenza', 'type', 'select', absenceTypes)}
                        <div className="grid grid-cols-2 gap-4">
                             {renderFieldLocal('Dal', 'startDate', 'date')}
                             {renderFieldLocal('Al', 'endDate', 'date')}
                        </div>
                        {renderFieldLocal('Note', 'note')}
                    </>
                );
            case 'manualClockIn':
            case 'adminClockIn':
            case 'manualClockOut':
            case 'adminClockOut':
                const isClockIn = type.includes('In');
                const areas = workAreas.filter(wa => item?.workAreaIds?.includes(wa.id) || userData?.role === 'admin' || userData?.managedAreaIds?.includes(wa.id));
                const aOpts = areas.map(a => ({ value: a.id, label: a.name }));
                return (
                    <>
                        <div style={{ paddingBottom: '15px', marginBottom: '15px', borderBottom: '1px solid #eee' }}>
                            <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>Dipendente</p>
                            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111' }}>{employeeName}</p>
                        </div>
                        {renderFieldLocal(isClockIn ? 'Ora Entrata' : 'Ora Uscita', 'manualTime', 'datetime-local')}
                        {isClockIn && renderFieldLocal('Area', 'selectedAreaId', 'select', aOpts)}
                        <div className="mb-3">
                            <label style={labelStyle}>Motivo</label>
                            <textarea name="note" value={formData.note || ''} onChange={handleChange} rows="2" style={{...inputStyle, resize: 'vertical'}}></textarea>
                        </div>
                    </>
                );
            case 'deleteEmployee':
                return (
                    <div className="text-center py-6">
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>📁</div>
                         <p style={{fontSize: '18px', color: '#1f2937', marginBottom: '10px'}}>
                             Vuoi <b>{isHardDelete ? 'ELIMINARE DEFINITIVAMENTE' : 'ARCHIVIARE'}</b> il dipendente <br/>
                             <span style={{fontWeight: 'bold', fontSize: '20px'}}>{item?.name || employeeName}</span>?
                         </p>
                         
                         <p style={{fontSize: '14px', color: isHardDelete ? '#b91c1c' : '#b45309', backgroundColor: isHardDelete ? '#fee2e2' : '#fffbeb', display: 'inline-block', padding: '8px 12px', borderRadius: '4px', border: `1px solid ${isHardDelete ? '#fecaca' : '#fcd34d'}`}}>
                             {isHardDelete 
                                ? "⚠️ ATTENZIONE: Verranno cancellati ANCHE LE TIMBRATURE STORICHE e i totali ore. Non apparirà più 'Sconosciuto', ma i dati saranno persi per sempre."
                                : "ℹ️ Il dipendente non potrà più accedere all'App, ma lo storico delle presenze rimarrà salvato (consigliato)."
                             }
                         </p>

                         {/* CHECKBOX ELIMINAZIONE TOTALE */}
                         <div style={{marginTop: '20px', textAlign: 'left', backgroundColor: '#f3f4f6', padding: '10px', borderRadius: '6px', border: '1px solid #e5e7eb'}}>
                             <label style={{display: 'flex', alignItems: 'center', cursor: 'pointer'}}>
                                 <input 
                                    type="checkbox" 
                                    checked={isHardDelete} 
                                    onChange={(e) => setIsHardDelete(e.target.checked)}
                                    style={{width: '20px', height: '20px', marginRight: '10px', cursor: 'pointer'}}
                                 />
                                 <span style={{fontSize: '14px', fontWeight: 'bold', color: '#374151'}}>
                                     Voglio eliminare definitivamente e cancellare tutto lo storico
                                 </span>
                             </label>
                         </div>
                    </div>
                );
            case 'restoreEmployee':
                return (
                    <div className="text-center py-6">
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>♻️</div>
                         <p style={{fontSize: '18px', color: '#1f2937', marginBottom: '10px'}}>
                             Vuoi <b>RIATTIVARE</b> il dipendente <br/>
                             <span style={{fontWeight: 'bold', fontSize: '20px'}}>{item?.name || employeeName}</span>?
                         </p>
                         <p style={{fontSize: '14px', color: '#15803d', backgroundColor: '#dcfce7', display: 'inline-block', padding: '8px 12px', borderRadius: '4px', border: '1px solid #86efac'}}>
                             Il dipendente potrà nuovamente accedere e timbrare.
                         </p>
                    </div>
                );
            case 'deleteArea':
            case 'deleteAdmin':
            case 'resetDevice':
            case 'applyPredefinedPause':
                return (
                    <div className="text-center py-6">
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>⚠️</div>
                         <p style={{fontSize: '18px', color: '#1f2937', marginBottom: '10px'}}>
                             Confermi l'operazione su <br/>
                             <span style={{fontWeight: 'bold', fontSize: '20px'}}>{item?.name || employeeName}</span>?
                         </p>
                         <p style={{fontSize: '14px', color: '#dc2626', backgroundColor: '#fee2e2', display: 'inline-block', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold'}}>
                             L'azione è irreversibile.
                         </p>
                    </div>
                );
            default:
                return <p>Errore tipo modale: {type}</p>;
        }
    };

    const getTitle = () => {
        if(type === 'employeeActions') return `Gestione: ${item?.name} ${item?.surname}`;
        if(type === 'newEmployee') return 'Nuovo Dipendente';
        if(type === 'newArea') return 'Nuova Area di Lavoro';
        if(type === 'newAdmin') return 'Nuovo Admin/Preposto';
        if(type === 'manualEntryForm' || type === 'manualEntry') return 'Recupero Dimenticanza';
        if(type === 'absenceEntryForm' || type === 'justification') return 'Inserimento Giustificativo';
        if(type === 'prepostoAddEmployeeToAreas') return 'Aggiungi Dipendente alle tue Aree';
        
        if(type === 'deleteEmployee') return isHardDelete ? 'Elimina Definitivamente' : 'Archivia Dipendente'; 
        if(type === 'restoreEmployee') return 'Riattiva Dipendente'; 
        
        if(type.includes('delete')) return 'Conferma Eliminazione';
        if(type.includes('Clock')) return 'Timbratura Manuale';
        if(type.includes('assign')) return 'Assegnazione';
        if(type.includes('edit')) return 'Modifica Dati';
        return 'Conferma Azione';
    };

    return ReactDOM.createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <div onClick={() => setShowModal(false)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 100000 }} />
            <div className="shadow-2xl flex flex-col mx-4" style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', maxHeight: '85vh', zIndex: 100001, position: 'relative', borderRadius: '12px', overflow: 'hidden', color: '#000000' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#111827' }}>{getTitle()}</h3>
                        {['assignArea', 'assignPrepostoAreas', 'assignEmployeeToPrepostoArea', 'editEmployee', 'manualEntryForm', 'manualEntry', 'absenceEntryForm', 'justification'].includes(type) && item && (
                            <div style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
                                Dipendente: <span style={{ fontWeight: 'bold', color: '#374151' }}>{item.name} {item.surname}</span>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    {error && <div style={{marginBottom: '16px', padding: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '14px', border: '1px solid #fecaca'}}>{error}</div>}
                    <form id="modal-form" onSubmit={handleSubmit}>
                        {renderModalBody()}
                    </form>
                </div>
                <div style={{ padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', color: '#374151', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Annulla</button>
                    {/* Se il tipo è employeeActions non mostriamo il tasto SALVA ma solo Annulla (o Chiudi) */}
                    {type !== 'employeeActions' && (
                        <button type="submit" form="modal-form" disabled={isLoading} style={{ padding: '10px 20px', backgroundColor: (type.includes('delete') || isHardDelete) ? '#dc2626' : (type === 'restoreEmployee' ? '#16a34a' : '#2563eb'), border: 'none', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                            {isLoading ? 'Attendi...' : (type === 'deleteEmployee' ? (isHardDelete ? 'Elimina Definitivamente' : 'Archivia') : (type === 'restoreEmployee' ? 'Ripristina' : (type.includes('delete') ? 'Elimina definitivamente' : 'Salva')))}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AdminModal;