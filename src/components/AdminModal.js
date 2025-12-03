// File: src/js/components/AdminModal.js
/* eslint-disable no-unused-vars */

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ==================================================================================================
// NOTA BENE: Le funzioni helper renderField e renderSingleCheckbox sono definite in AdminDashboard.js
// e sono replicate qui solo per evitare errori di linting in ambienti che compilano i file isolati.
// ==================================================================================================

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, user, allEmployees, userData, onAdminClockIn, onAdminApplyPause, showNotification }) => {

    // Stati generici per i form
    const [formData, setFormData] = useState({});
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);


    // Popola i campi del form quando si apre la modale
    useEffect(() => {
        setFormData({});
        setError('');
        setIsLoading(false);

        const now = new Date();
        
        // --- CREAZIONE STRINGA ORARIO LOCALE YYYY-MM-DDTHH:mm (INVARIANTI) ---
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTimeISO = `${yyyy}-${MM}-${dd}T${HH}:${mm}`;
        // -----------------------------------------------------------------------


        if (type === 'bypassRestPeriod') { 
             setFormData({ reason: '' });
        }
        else if (type === 'editAreaPauseOnly') { // CASO SPECIFICO PREPOSTO: SOLO PAUSA
             setFormData({ pauseDuration: item.pauseDuration || 0 });
        }
        else if (item) {
            // *** Inizializzazione della Timbratura Manuale/Forzata ***
            if (type === 'adminClockIn' || type === 'manualClockIn' || type === 'manualClockOut' || type === 'adminClockOut') {
                 
                const employeeId = item.id; 
                
                // DETERMINA LE AREE DISPONIBILI PER LA TIMBRATURA MANUALE/FORZATA
                let availableAreas = [];
                if (userData?.role === 'admin') {
                    // Admin può scegliere tutte le aree
                    availableAreas = workAreas;
                } else if (userData?.role === 'preposto') {
                    // Preposto può scegliere solo le aree gestite
                    const managedAreaIds = userData?.managedAreaIds || [];
                    availableAreas = workAreas.filter(wa => managedAreaIds.includes(wa.id));
                } else {
                    // Per dipendenti normali timbrati dall'admin, mostra solo le loro aree assegnate
                    availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                }
                
                // Controlla l'uscita
                const isClockOut = type === 'manualClockOut' || type === 'adminClockOut';

                if (availableAreas.length === 0 && !isClockOut) {
                     setError("Nessuna area disponibile per la timbratura. Contatta l'amministratore.");
                     setIsLoading(true);
                }

                setFormData({ 
                    selectedEmployeeId: employeeId, 
                    selectedAreaId: availableAreas.length > 0 ? availableAreas[0].id : '', 
                    manualTime: currentTimeISO, 
                    note: '', 
                });
            } 
            // ... (altre logiche di item)
            else if (type === 'editEmployee') {
                setFormData({
                    name: item.name,
                    surname: item.surname,
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
                const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                if (managedAreas.length === 0) {
                    setError("Non gestisci nessuna area specifica. Contatta l'amministratore per farti assegnare delle aree.");
                    setIsLoading(true);
                }
                const managedAreaIds = userData?.managedAreaIds || [];
                const preExistingAssignments = (item.workAreaIds || []).filter(id => managedAreaIds.includes(id));
                setFormData({ selectedPrepostoAreas: preExistingAssignments });
            }


        } else {
            // I form di creazione newArea, newEmployee, newAdmin non sono più gestiti qui.
        }
    }, [item, type, workAreas, userData, user?.uid]);


    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        // Gestione standard degli input
        if (type === 'checkbox') {
            if (name === 'selectedAreas' || name === 'selectedPrepostoAreas') {
                const currentSelection = formData[name] || [];
                if (checked) {
                    setFormData(prev => ({ ...prev, [name]: [...currentSelection, value] }));
                } else {
                    setFormData(prev => ({ ...prev, [name]: currentSelection.filter(id => id !== value) }));
                }
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
    
    // =======================================================
    // FUNZIONI HELPER LOCALI DI RENDER (solo per evitare no-undef)
    // Queste funzioni sono stubs per consentire al linter di compilare AdminModal.js isolatamente.
    // Il rendering effettivo nel Modale utilizza queste definizioni locali, ma passano i dati di formData.
    // =======================================================

    const renderFieldLocal = (label, name, inputType = 'text', options = [], required = true) => (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
            {inputType === 'select' ? (
                 <select
                     id={name} name={name} value={formData[name] ?? ''} onChange={handleChange}
                     required={required}
                     className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                 >
                     {(!required || options.length > 0) && <option value="">{options.length > 0 ? '-- Seleziona --' : '-- Nessuna Opzione --'}</option>}
                     {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                 </select>
            ) : (
                <input
                    id={name} name={name} type={inputType} value={formData[name] ?? ''} onChange={handleChange}
                    step={inputType === 'number' ? 'any' : undefined}
                    required={required}
                    placeholder={name === 'latitude' ? 'Es. 40.8518' : name === 'longitude' ? 'Es. 14.2681' : undefined}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
            )}
        </div>
    );

    const renderSingleCheckboxLocal = (label, name, description = '') => (
        <div className="flex items-start pt-4">
            <div className="flex items-center h-5">
                <input
                    id={name}
                    name={name}
                    type="checkbox"
                    checked={!!formData[name]}
                    onChange={handleChange}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
            </div>
            <div className="ml-3 text-sm">
                <label htmlFor={name} className="font-medium text-gray-700">{label}</label>
                {description && <p className="text-gray-500">{description}</p>}
            </div>
        </div>
    );

    // =======================================================
    
    
    // --- FUNZIONI DI GESTIONE SUBMIT ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // NOTA: Manteniamo questa variabile per sicurezza, ma la logica principale
        // per manualClockIn ora userà direttamente la conversione Date -> toISOString().
        let manualTime = formData.manualTime;
        if (manualTime) {
             manualTime = manualTime.substring(0, 16); 
        }

        const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!clientTimezone) {
             setError("Impossibile determinare il Fuso Orario locale.");
             setIsLoading(false);
             return;
        }
        
        const successMessage = (type) => {
            if (type.includes('delete')) return 'Elemento eliminato con successo.';
            if (type.includes('assign')) return 'Assegnazione aggiornata con successo.';
            if (type.includes('editAreaPauseOnly')) return 'Durata pausa aggiornata con successo.';
            if (type.includes('edit')) return 'Dati aggiornati con successo.';
            if (type.includes('Clock')) return `Timbratura ${type.includes('In') ? 'di entrata' : 'di uscita'} registrata.`;
            return 'Operazione completata con successo.';
        };


        try {
            switch (type) {
                case 'bypassRestPeriod': 
                    // Logica omessa
                    break;
                case 'prepostoAddEmployeeToAreas':
                    console.warn("Tentativo di eseguire prepostoAddEmployeeToAreas dalla modale (obsoleto).");
                    throw new Error("Si prega di usare il form in-line per questa azione.");
                
                case 'editEmployee':
                    if (!formData.name || !formData.surname) throw new Error('Nome e cognome sono obbligatori.');
                    await updateDoc(doc(db, "employees", item.id), {
                        name: formData.name,
                        surname: formData.surname,
                        controlloGpsRichiesto: formData.controlloGpsRichiesto
                    });
                    break;
                case 'deleteEmployee':
                    const deleteUser = httpsCallable(functions, 'deleteUserAndEmployee');
                    await deleteUser({ userId: item.userId });
                    break;
                case 'resetDevice':
                    await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                    break;
                case 'editArea':
                     if (!formData.name || formData.latitude == null || formData.longitude == null || formData.radius == null) throw new Error('Tutti i campi (Nome, Latitudine, Longitudine, Raggio) sono obbligatori.');
                     const editLat = Number(formData.latitude); const editLon = Number(formData.longitude); const editRad = Number(formData.radius);
                     if (isNaN(editLat) || isNaN(editLon) || isNaN(editRad) || editRad <= 0) { throw new Error('Latitudine, Longitudine devono essere numeri validi e Raggio deve essere > 0.'); }
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, pauseDuration: Number(formData.pauseDuration || 0), latitude: editLat, longitude: editLon, radius: editRad });
                    break;
                case 'editAreaPauseOnly': // CASO AGGIUNTO: SOLO PAUSE DURATION
                     const pauseDuration = Number(formData.pauseDuration || 0);
                     if (isNaN(pauseDuration) || pauseDuration < 0) { throw new Error('Durata pausa deve essere un numero positivo o zero.'); }
                     await updateDoc(doc(db, "work_areas", item.id), { pauseDuration: pauseDuration });
                     break; 
                case 'deleteArea':
                    await deleteDoc(doc(db, "work_areas", item.id));
                    break;
                case 'assignArea':
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.selectedAreas || [] });
                    break;
                case 'assignPrepostoAreas': // Assegna Aree di GESTIONE a Admin/Preposto
                    await updateDoc(doc(db, "users", item.id), {
                        managedAreaIds: formData.selectedAreas || [],
                        controlloGpsRichiesto: formData.controlloGpsRichiesto
                    });
                    break;
                case 'assignEmployeeToPrepostoArea':
                    const selectedIds = formData.selectedPrepostoAreas || [];
                    const prepostoAssignSingle = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
                    await prepostoAssignSingle({ employeeId: item.id, areaIds: selectedIds });
                    break;
                case 'deleteAdmin':
                     const deleteAdminFn = httpsCallable(functions, 'deleteUserAndEmployee');
                     await deleteAdminFn({ userId: item.id });
                     break;

                // --- TIMBRATURE MANUALI ---
                // MODIFICA APPLICATA QUI: Conversione in UTC per fixare fuso orario (+1 ora)
                case 'manualClockIn':
                case 'adminClockIn': 
                case 'manualClockOut':
                case 'adminClockOut':
                    
                    const isClockIn = type === 'manualClockIn' || type === 'adminClockIn'; 
                    const isClockOut = type === 'manualClockOut' || type === 'adminClockOut'; 

                    if (!formData.selectedAreaId && isClockIn) throw new Error('Seleziona un\'area.');
                    if (!formData.manualTime) throw new Error('Seleziona un orario.');
                    
                    const isNoteRequired = type === 'adminClockIn' || type === 'adminClockOut'; 
                    if (isNoteRequired && !formData.note) {
                        throw new Error('Il Motivo della timbratura manuale è obbligatorio per le timbrature forzate.');
                    }

                    if (!user.uid) throw new Error("Utente non autenticato.");

                    // *** INIZIO CORREZIONE FUSO ORARIO ***
                    // 1. Creiamo un oggetto Date basato sull'input del browser.
                    // Il browser sa che "2025-12-02T10:00" inserito qui equivale all'ora locale.
                    const localDateObj = new Date(formData.manualTime);
                    
                    // 2. Controllo validità data
                    if (isNaN(localDateObj.getTime())) {
                        throw new Error("L'orario inserito non è valido.");
                    }

                    // 3. Convertiamo in stringa ISO UTC completa (es. ...T09:00:00.000Z)
                    // In questo modo inviamo al server l'istante esatto universale, evitando la doppia conversione locale.
                    const utcIsoString = localDateObj.toISOString(); 
                    // *** FINE CORREZIONE FUSO ORARIO ***

                    const functionName = isClockIn ? 'manualClockIn' : 'manualClockOut';
                    const clockFunction = httpsCallable(functions, functionName);
                    
                    const payload = {
                        employeeId: formData.selectedEmployeeId, 
                        workAreaId: isClockIn ? formData.selectedAreaId : undefined,
                        timestamp: utcIsoString, // <--- INVIAMO LA DATA GIA' CONVERTITA IN UTC
                        note: formData.note, 
                        adminId: user.uid,
                        timezone: clientTimezone,
                        entryId: isClockOut ? item.activeEntry?.id : undefined
                    };
                    
                    await clockFunction(payload);
                    break;
                
                // --- PAUSE ---
                case 'applyPredefinedPause':
                    await onAdminApplyPause(item);
                    setIsLoading(false);
                    return;

                default:
                    console.error("Tipo di modal non gestito nello switch handleSubmit:", type);
                    throw new Error("Azione modale non riconosciuta.");
            }

            showNotification(successMessage(type), 'success');
            await onDataUpdate();
            setShowModal(false);

        } catch (err) {
            console.error(`Errore durante l'operazione '${type}':`, err);
            const errorMessage = err.message || "Si è verificato un errore sconosciuto (Server Internal Error).";
            setError(errorMessage.includes(":") ? errorMessage.message.split(":")[1].trim() : errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // --- RENDER DEI CONTENUTI SPECIFICI DELLA MODALE ---
    const renderContent = () => {
        // Funzione locale per renderizzare le checkbox (copiata per evitare duplicazioni inutili)
        const renderCheckboxes = (label, name, items, disabled = false) => (
             <div>
                 <label className="block text-sm font-medium text-gray-700">{label}</label>
                 {items && items.length > 0 ? (
                      <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-2 bg-gray-50">
                          {items
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(it => (
                                  <div key={it.id} className="flex items-center">
                                      <input
                                          id={`${name}-${it.id}`} name={name} type="checkbox" value={it.id}
                                          checked={(formData[name] || []).includes(it.id)}
                                          onChange={handleChange} disabled={disabled}
                                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:opacity-50"
                                      />
                                      <label htmlFor={`${name}-${it.id}`} className={`ml-3 block text-sm ${disabled ? 'text-gray-400' : 'text-gray-800'}`}>{it.name}</label>
                                  </div>
                              ))}
                      </div>
                 ) : (
                      <p className="text-sm text-gray-500 mt-2">{disabled ? 'Nessuna area disponibile.' : 'Nessuna area definita.'}</p>
                 )}
             </div>
          );
          
        
        // CORREZIONE LOGICA: isClockIn controlla solo azioni esplicite di entrata
        const isClockIn = type === 'manualClockIn' || type === 'adminClockIn'; 
        
        // Titolo dinamico
        const employeeName = item?.name ? `${item.name} ${item.surname}` : 'N/A';
        const baseTitle = isClockIn ? 'Entrata Manuale' : 'Uscita Manuale';
        
        const title = {
            manualClockIn: baseTitle,
            manualClockOut: baseTitle,
            adminClockIn: baseTitle,
            adminClockOut: baseTitle, 
            editEmployee: `Modifica Dipendente: ${employeeName}`,
            deleteEmployee: `Elimina Dipendente: ${employeeName}`,
            newArea: 'Crea Nuova Area',
            editArea: `Modifica Area: ${item?.name || 'N/A'}`,
            deleteArea: `Elimina Area: ${item?.name || 'N/A'}`,
            assignArea: `Assegna Aree a Dipendente: ${employeeName}`,
            prepostoAddEmployeeToAreas: `Assegna Aree di Tua Competenza`,
            assignEmployeeToPrepostoArea: `Gestisci Aree di ${employeeName}`,
            newAdmin: 'Crea Nuovo Admin/Preposto',
            deleteAdmin: `Elimina Utente: ${item?.name || 'N/A'}`,
            assignPrepostoAreas: `Assegna Aree di Gestione a ${item?.name || 'N/A'}`, 
            editAreaPauseOnly: `Modifica Pausa Area: ${item?.name || 'N/A'}`, // NUOVO TITOLO
        }[type] || 'Conferma Azione';


        let body;
        switch (type) {
            case 'editEmployee':
                body = (
                    <div className="space-y-4">
                        {renderFieldLocal('Nome', 'name')}
                        {renderFieldLocal('Cognome', 'surname')}
                        {renderSingleCheckboxLocal('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, l\'utente potrà timbrare ovunque.')}
                    </div>
                );
                break;
            case 'editArea':
                body = <div className="space-y-4">{renderFieldLocal('Nome Area', 'name')}{renderFieldLocal('Durata Pausa Predefinita (minuti)', 'pauseDuration', 'number', [], false)}{renderFieldLocal('Latitudine', 'latitude', 'number')}{renderFieldLocal('Longitudine', 'longitude', 'number')}{renderFieldLocal('Raggio di Tolleranza (metri)', 'radius', 'number')}</div>;
                break;
            case 'editAreaPauseOnly': // NUOVO CASO: SOLO PAUSA
                body = (
                    <div className="space-y-4">
                         <p className="text-sm text-gray-500">Stai modificando solo la durata della pausa per l'area: <b>{item.name}</b></p>
                         {renderFieldLocal('Durata Pausa Predefinita (minuti)', 'pauseDuration', 'number', [], true)}
                    </div>
                );
                break;

            case 'assignArea':
                body = renderCheckboxes('Seleziona le aree per questo dipendente', 'selectedAreas', workAreas);
                break;
            
            case 'assignPrepostoAreas': // Assegna Aree di GESTIONE a Admin/Preposto
                body = (
                    <div className="space-y-4">
                        <p className="text-sm font-semibold text-gray-700">Assegna le aree che {item.name} gestirà. Se non è un preposto, questo campo non ha effetto sul suo profilo.</p>
                        {renderCheckboxes('Seleziona le aree di gestione', 'selectedAreas', workAreas)}
                        {renderSingleCheckboxLocal('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, questo utente (Admin/Preposto) potrà timbrare ovunque.')}
                    </div>
                );
                break;
            
            case 'prepostoAddEmployeeToAreas':
                // Questo caso non dovrebbe mai essere raggiunto dall'Action Header, ma è mantenuto per compatibilità
                const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                const employeeOptions = allEmployees
                    .sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`))
                    .map(emp => ({ value: emp.id, label: `${emp.name} ${emp.surname} (${emp.email})` }));

                body = (
                    <div className="space-y-4">
                        {renderFieldLocal('Seleziona Dipendente da Aggiungere', 'selectedEmployee', 'select', employeeOptions, true)}
                        {renderCheckboxes('Seleziona le aree di tua competenza a cui assegnarlo', 'selectedPrepostoAreas', managedAreas, managedAreas.length === 0)}
                    </div>
                );
                break;
            case 'assignEmployeeToPrepostoArea':
                const prepostoManagedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                body = renderCheckboxes('Seleziona le aree di tua competenza per questo dipendente', 'selectedPrepostoAreas', prepostoManagedAreas, prepostoManagedAreas.length === 0);
                break;

            // --- Timbratura Manuale: Corrette per ora e area ---
            case 'manualClockIn':
            case 'adminClockIn': 
            case 'manualClockOut':
            case 'adminClockOut':
                
                const isClockInOnly = type === 'manualClockIn' || type === 'adminClockIn'; 
                
                const areasList = workAreas.filter(wa => 
                    item?.workAreaIds?.includes(wa.id) || 
                    (userData?.role === 'admin') || 
                    (userData?.role === 'preposto' && userData?.managedAreaIds?.includes(wa.id))
                );

                const noteIsRequired = type === 'adminClockIn' || type === 'adminClockOut'; 

                body = (
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-800">Dipendente: {item?.name} {item?.surname}</p>
                        
                        {/* CAMPO ORA/DATA */}
                        {renderFieldLocal(isClockInOnly ? 'Orario di Entrata' : 'Orario di Uscita', 'manualTime', 'datetime-local')}

                        {/* CAMPO AREA - Richiesto solo per Entrata */}
                        {isClockInOnly && (
                            areasList.length > 0 ? renderFieldLocal('Seleziona Area di Lavoro', 'selectedAreaId', 'select', areasList.map(a => ({value: a.id, label: a.name}))) 
                            : <p className="text-sm text-red-500">Nessuna area disponibile.</p>
                        )}

                        {/* CAMPO MOTIVO (Obbligatorio solo per timbrature di altri dipendenti) */}
                        <div>
                             <label htmlFor="note" className="block text-sm font-medium text-gray-700">
                                 Motivo Timbratura Manuale ({noteIsRequired ? 'Obbligatorio' : 'Opzionale'})
                             </label>
                             <textarea
                                 id="note"
                                 name="note"
                                 value={formData.note ?? ''}
                                 onChange={handleChange}
                                 rows="2"
                                 required={noteIsRequired}
                                 className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                             />
                        </div>
                    </div>
                );
                break;

            // Casi solo conferma (delete, reset, apply pause)
            case 'deleteEmployee':
            case 'deleteArea':
            case 'resetDevice':
            case 'applyPredefinedPause':
            case 'deleteAdmin': 
                body = <p>Sei sicuro di voler procedere? L'azione potrebbe non essere reversibile.</p>;
                break;
            
            case 'newEmployee': // Questi casi non dovrebbero mai essere raggiunti
            case 'newArea':
            case 'newAdmin':
            case 'bypassRestPeriod':
                console.error("Tipo di modale di creazione obsoleto raggiunto:", type);
                body = <p>Tipo di operazione di creazione non più supportato dalla modale. Usa i form in-line.</p>;
                break;

            // Caso di errore/default
            default:
                console.warn("Configurazione modale non valida ricevuta:", type);
                body = <p>Configurazione modale non valida. Azione: {type}</p>; // Mostra l'azione per debug
                break;
        }

        const submitText = type.startsWith('delete') ? 'Elimina' : 'Conferma';
        
        return (
            <form onSubmit={handleSubmit}>
                <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-4">{title}</h3>
                {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                <div className="mb-6">{body}</div>
                <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4 mt-6">
                    <button type="button" onClick={() => { setError(''); setShowModal(false); }} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Annulla</button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        {isLoading ? 'Salvataggio...' : submitText}
                    </button>
                </div>
            </form>
        );
    };

    // --- Render Struttura Modale ---
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4 transition-opacity duration-300 ease-out" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="fixed inset-0" aria-hidden="true" onClick={() => setShowModal(false)}></div>
             <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-auto transform transition-all duration-300 ease-out sm:my-8" role="document">
                 <div className="p-6">
                     {renderContent()}
                 </div>
             </div>
        </div>
    );
};

export default AdminModal;