// File: src/js/components/AdminModal.js (FINALE: SENZA LOGICA RIPOSO 8H)

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, user, allEmployees, userData, onAdminClockIn, onAdminApplyPause }) => {

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
        
        // --- FIX FUSO ORARIO: Creazione stringa orario locale YYYY-MM-DDTHH:mm ---
        const yyyy = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTimeISO = `${yyyy}-${MM}-${dd}T${HH}:${mm}`;
        // -----------------------------------------------------------------------


        if (type === 'bypassRestPeriod') { // RIMOZIONE: questa modale non viene più utilizzata
             setFormData({ reason: '' });
        }
        else if (type === 'prepostoAddEmployeeToAreas') {
             const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
             if (managedAreas.length === 0) {
                 setError("Non gestisci nessuna area specifica. Contatta l'amministratore.");
                 setIsLoading(true);
             }
             setFormData({
                 selectedEmployee: '',
                 selectedPrepostoAreas: []
             });
        }
        else if (item) {
            // *** CORREZIONE: Inizializzazione della Timbratura Manuale/Forzata ***
            if (type === 'adminClockIn' || type === 'manualClockIn' || type === 'manualClockOut') {
                 
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
                
                if (availableAreas.length === 0 && type !== 'manualClockOut') {
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
            } else if (type === 'assignManagedAreas') {
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
            // Logica per modali di creazione (item non fornito)
            if (type === 'newArea') {
                setFormData({ name: '', pauseDuration: 0, latitude: '', longitude: '', radius: 100 });
            } else if (type === 'newEmployee') {
                setFormData({
                    name: '', surname: '', email: '', password: '',
                    controlloGpsRichiesto: true
                });
            } else if (type === 'newAdmin') {
                setFormData({
                    name: '', surname: '', email: '', password: '', phone: '', role: 'preposto',
                    controlloGpsRichiesto: true
                });
            }
        }
    }, [item, type, workAreas, userData, user?.uid]);


    const functions = getFunctions(undefined, 'europe-west1');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        // Gestione standard degli input (omessa per brevità)
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

    // --- FUNZIONI DI GESTIONE SUBMIT ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // *** FIX CRITICO PER LA DATA: Assicurarsi che sia YYYY-MM-DDTHH:MM ***
        let manualTime = formData.manualTime;
        if (manualTime) {
             manualTime = manualTime.substring(0, 16); 
        }
        // ****************************************************

        // --- AGGIUNTA: Determina il Fuso Orario del Client ---
        const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!clientTimezone) {
             throw new Error("Impossibile determinare il Fuso Orario locale (timezone).");
        }
        // ----------------------------------------------------

        try {
            switch (type) {
                case 'bypassRestPeriod': // RIMOZIONE: la modale non è più utilizzata
                    if (!item || !item.id) throw new Error("Dipendente non selezionato.");
                    if (!formData.reason) throw new Error("Motivo di sblocco obbligatorio.");

                    // La funzione adminBypassRestPeriod è stata rimossa dal backend
                    // const bypassFn = httpsCallable(functions, 'adminBypassRestPeriod');
                    // await bypassFn({ employeeId: item.id, reason: formData.reason });
                    // alert(`Riposo di 8 ore sbloccato per ${item.name} ${item.surname}.`);
                    break;
                case 'prepostoAddEmployeeToAreas':
                    if (!formData.selectedEmployee) throw new Error("Devi selezionare un dipendente.");
                    if (!formData.selectedPrepostoAreas || formData.selectedPrepostoAreas.length === 0) throw new Error("Devi selezionare almeno un'area da assegnare.");

                    const employeeToAssignId = formData.selectedEmployee;
                    const areaIdsToAssign = formData.selectedPrepostoAreas;

                    const prepostoAssign = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
                    await prepostoAssign({ employeeId: employeeToAssignId, areaIds: areaIdsToAssign });

                    alert('Aree assegnate con successo al dipendente selezionato.');
                    break;
                
                case 'newEmployee':
                    if (!formData.name || !formData.surname || !formData.email || !formData.password) throw new Error('Nome, Cognome, Email e Password sono obbligatori.');
                    const createUser = httpsCallable(functions, 'createUser');
                    await createUser({ ...formData, role: 'dipendente', createdBy: user.uid });
                    alert('Dipendente creato con successo!');
                    break;
                case 'editEmployee':
                    if (!formData.name || !formData.surname) throw new Error('Nome e cognome sono obbligatori.');
                    await updateDoc(doc(db, "employees", item.id), {
                        name: formData.name,
                        surname: formData.surname,
                        controlloGpsRichiesto: formData.controlloGpsRichiesto
                    });
                    alert('Dipendente aggiornato!');
                    break;
                case 'deleteEmployee':
                    if (!window.confirm(`Sei sicuro di voler eliminare ${item.name} ${item.surname}? L'operazione eliminerà anche l'account di accesso e NON è reversibile.`)) { setIsLoading(false); return; }
                    const deleteUser = httpsCallable(functions, 'deleteUserAndEmployee');
                    await deleteUser({ userId: item.userId });
                    alert('Dipendente e account di accesso eliminati.');
                    break;
                case 'resetDevice':
                    if (!window.confirm(`Resettare l'associazione del dispositivo per ${item.name} ${item.surname}? Dovrà registrare nuovamente il dispositivo al prossimo login.`)) { setIsLoading(false); return; }
                    await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                    alert('Associazione dispositivo resettata.');
                    break;
                case 'newArea':
                    if (!formData.name || formData.latitude == null || formData.longitude == null || formData.radius == null) throw new Error('Tutti i campi (Nome, Latitudine, Longitudine, Raggio) sono obbligatori.');
                    const lat = Number(formData.latitude); const lon = Number(formData.longitude); const rad = Number(formData.radius);
                    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) { throw new Error('Latitudine, Longitudine devono essere numeri validi e Raggio deve essere > 0.'); }
                    const createArea = httpsCallable(functions, 'createWorkArea');
                    await createArea({ name: formData.name, pauseDuration: Number(formData.pauseDuration || 0), latitude: lat, longitude: lon, radius: rad });
                    alert('Area creata con successo!');
                    break;
                case 'editArea':
                     if (!formData.name || formData.latitude == null || formData.longitude == null || formData.radius == null) throw new Error('Tutti i campi (Nome, Latitudine, Longitudine, Raggio) sono obbligatori.');
                     const editLat = Number(formData.latitude); const editLon = Number(formData.longitude); const editRad = Number(formData.radius);
                     if (isNaN(editLat) || isNaN(editLon) || isNaN(editRad) || editRad <= 0) { throw new Error('Latitudine, Longitudine devono essere numeri validi e Raggio deve essere > 0.'); }
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, pauseDuration: Number(formData.pauseDuration || 0), latitude: editLat, longitude: editLon, radius: editRad });
                    alert('Area aggiornata!');
                    break;
                case 'deleteArea':
                    if (!window.confirm(`Sei sicuro di voler eliminare l'area "${item.name}"? L'operazione NON è reversibile.`)) { setIsLoading(false); return; }
                    await deleteDoc(doc(db, "work_areas", item.id));
                    alert('Area eliminata.');
                    break;
                case 'assignArea':
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.selectedAreas || [] });
                    alert('Aree assegnate con successo al dipendente.');
                    break;
                case 'assignManagedAreas':
                    await updateDoc(doc(db, "users", item.id), {
                        managedAreaIds: formData.selectedAreas || [],
                        controlloGpsRichiesto: formData.controlloGpsRichiesto
                    });
                    alert('Aree di gestione e impostazioni aggiornate per il preposto.');
                    break;
                case 'assignEmployeeToPrepostoArea':
                    const selectedIds = formData.selectedPrepostoAreas || [];
                    const prepostoAssignSingle = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
                    await prepostoAssignSingle({ employeeId: item.id, areaIds: selectedIds });
                    alert('Aree di competenza aggiornate per il dipendente.');
                    break;
                case 'newAdmin':
                    if (!formData.name || !formData.surname || !formData.email || !formData.password || !formData.role) throw new Error('Tutti i campi sono obbligatori.');
                    if (formData.password.length < 6) throw new Error('La password deve essere di almeno 6 caratteri.');
                     const createAdminFn = httpsCallable(functions, 'createUser');
                    await createAdminFn({ ...formData, createdBy: user.uid });
                    alert(`Utente ${formData.role} creato con successo!`);
                     break;
                case 'deleteAdmin':
                     if (!window.confirm(`Sei sicuro di voler eliminare l'utente ${item.name} ${item.surname} (${item.role})? L'operazione NON è reversibile.`)) { setIsLoading(false); return; }
                     const deleteAdminFn = httpsCallable(functions, 'deleteUserAndEmployee');
                     await deleteAdminFn({ userId: item.id });
                     alert('Utente eliminato.');
                     break;

                // --- TIMBRATURE MANUALI (Corrette per l'ora locale) ---
                case 'manualClockIn':
                case 'adminClockIn': 
                case 'manualClockOut':
                    const isClockIn = type === 'manualClockIn' || type === 'adminClockIn';
                    if (!formData.selectedAreaId && isClockIn) throw new Error('Seleziona un\'area.');
                    if (!manualTime) throw new Error('Seleziona un orario.');
                    
                    // Controlli di obbligatorietà nota
                    const isNoteRequired = type === 'adminClockIn'; 
                    if (isNoteRequired && !formData.note) {
                        throw new Error('Il Motivo della timbratura manuale è obbligatorio per le timbrature forzate su altri dipendenti.');
                    }
                    // --------------------------------------------------------------------------

                    if (!user.uid) throw new Error("Utente non autenticato.");

                    const functionName = isClockIn ? 'manualClockIn' : 'manualClockOut';
                    const clockFunction = httpsCallable(functions, functionName);
                    
                    // --- PAYLOAD AGGIORNATO E COMPLETO ---
                    const payload = {
                        employeeId: formData.selectedEmployeeId, 
                        // workAreaId è richiesto solo per clockIn
                        workAreaId: isClockIn ? formData.selectedAreaId : undefined,
                        timestamp: manualTime, 
                        note: formData.note, 
                        adminId: user.uid,
                        timezone: clientTimezone, // <-- INVIA IL FUSO ORARIO RICHIESTO
                        // entryId è richiesto solo per manualClockOut
                        entryId: !isClockIn ? item.activeEntry?.id : undefined
                    };
                    
                    await clockFunction(payload);

                    alert(`Timbratura ${isClockIn ? 'di entrata' : 'di uscita'} registrata.`);
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

            await onDataUpdate();
            setShowModal(false);

        } catch (err) {
            console.error(`Errore durante l'operazione '${type}':`, err);
            // La variabile requiredRestHours non è più definita, rimuoviamo riferimenti inutili
            setError(err.message || "Si è verificato un errore sconosciuto (Server Internal Error).");
        } finally {
            setIsLoading(false);
        }
    };

    // --- RENDER DEI CONTENUTI SPECIFICI DELLA MODALE ---
    const renderContent = () => {
        const isManualClock = type === 'manualClockIn' || type === 'adminClockIn' || type === 'manualClockOut';
        const isClockIn = type === 'manualClockIn' || type === 'adminClockIn';
        
        // Titolo dinamico
        const employeeName = item?.name ? `${item.name} ${item.surname}` : 'N/A';
        const baseTitle = isManualClock ? `${isClockIn ? 'Entrata' : 'Uscita'} Manuale per ${employeeName}` : 'Conferma Azione';
        
        const title = {
            newEmployee: 'Aggiungi Nuovo Dipendente',
            editEmployee: `Modifica ${item?.name} ${item?.surname}`,
            deleteEmployee: `Elimina ${item?.name} ${item?.surname}`,
            newArea: 'Aggiungi Nuova Area di Lavoro',
            editArea: `Modifica Area "${item?.name}"`,
            deleteArea: `Elimina Area "${item?.name}"`,
            assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
            assignManagedAreas: `Gestisci Aree e Opzioni per ${item?.name} ${item?.surname}`,
            newAdmin: 'Aggiungi Personale Amministrativo',
            deleteAdmin: `Elimina ${item?.name} ${item?.surname} (${item?.role})`,
            resetDevice: `Resetta Dispositivo per ${item?.name} ${item?.surname}`,
            manualClockIn: baseTitle,
            manualClockOut: baseTitle,
            adminClockIn: baseTitle,
            applyPredefinedPause: `Applica Pausa Predefinita a ${item?.name} ${item?.surname}`,
            assignEmployeeToPrepostoArea: `Gestisci Aree per ${item?.name} ${item?.surname}`,
            prepostoAddEmployeeToAreas: 'Aggiungi Dipendente alle Tue Aree',
            bypassRestPeriod: `Sblocco Eccezionale Riposo 8h per ${item?.name} ${item?.surname}`, // RIMOZIONE: questa modale non viene più utilizzata
        }[type] || 'Conferma Azione';


        const renderField = (label, name, type = 'text', options = [], required = true) => (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                {type === 'select' ? (
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
                        id={name} name={name} type={type} value={formData[name] ?? ''} onChange={handleChange}
                        step={type === 'number' ? 'any' : undefined}
                        required={required}
                        placeholder={name === 'latitude' ? 'Es. 40.8518' : name === 'longitude' ? 'Es. 14.2681' : undefined}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                )}
            </div>
        );

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

        const renderSingleCheckbox = (label, name, description = '') => (
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

        let body;
        switch (type) {
            case 'bypassRestPeriod': // RIMOZIONE: questa modale non viene più utilizzata
                 body = (
                     <div className="space-y-4">
                         <p className="text-sm text-yellow-700 bg-yellow-100 p-2 rounded">
                             Attenzione: Lo sblocco bypassa la regola delle 8 ore di riposo per l'Entrata e rimarrà attivo per **4 ore**.
                         </p>
                         <textarea
                             id="reason"
                             name="reason"
                             value={formData.reason ?? ''}
                             onChange={handleChange}
                             placeholder="Motivo dello sblocco eccezionale (Obbligatorio)"
                             required
                             rows="3"
                             className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                         />
                     </div>
                 );
                 break;

            case 'prepostoAddEmployeeToAreas':
                const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                const employeeOptions = allEmployees
                    .sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`))
                    .map(emp => ({ value: emp.id, label: `${emp.name} ${emp.surname} (${emp.email})` }));

                body = (
                    <div className="space-y-4">
                        {renderField('Seleziona Dipendente da Aggiungere', 'selectedEmployee', 'select', employeeOptions, true)}
                        {renderCheckboxes('Seleziona le aree di tua competenza a cui assegnarlo', 'selectedPrepostoAreas', managedAreas, managedAreas.length === 0)}
                    </div>
                );
                break;

            case 'newEmployee':
                body = (
                    <div className="space-y-4">
                        {renderField('Nome', 'name')}
                        {renderField('Cognome', 'surname')}
                        {renderField('Email', 'email', 'email')}
                        {renderField('Password (min. 6 caratteri)', 'password', 'password')}
                        {renderSingleCheckbox('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, l\'utente potrà timbrare ovunque.')}
                    </div>
                );
                break;
            case 'editEmployee':
                body = (
                    <div className="space-y-4">
                        {renderField('Nome', 'name')}
                        {renderField('Cognome', 'surname')}
                        {renderSingleCheckbox('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, l\'utente potrà timbrare ovunque.')}
                    </div>
                );
                break;
            case 'newArea':
            case 'editArea':
                body = <div className="space-y-4">{renderField('Nome Area', 'name')}{renderField('Durata Pausa Predefinita (minuti)', 'pauseDuration', 'number', [], false)}{renderField('Latitudine', 'latitude', 'number')}{renderField('Longitudine', 'longitude', 'number')}{renderField('Raggio di Tolleranza (metri)', 'radius', 'number')}</div>;
                break;
            case 'assignArea':
                body = renderCheckboxes('Seleziona le aree per questo dipendente', 'selectedAreas', workAreas);
                break;
            case 'assignManagedAreas':
                body = (
                    <div className="space-y-4">
                        {renderCheckboxes('Seleziona le aree che questo preposto gestirà', 'selectedAreas', workAreas)}
                        {renderSingleCheckbox('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, questo preposto/admin potrà timbrare ovunque.')}
                    </div>
                );
                break;

            case 'assignEmployeeToPrepostoArea':
                const prepostoManagedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id));
                body = renderCheckboxes('Seleziona le aree di tua competenza per questo dipendente', 'selectedPrepostoAreas', prepostoManagedAreas, prepostoManagedAreas.length === 0);
                break;

            case 'newAdmin':
                body = (
                    <div className="space-y-4">
                        {renderField('Nome', 'name')}
                        {renderField('Cognome', 'surname')}
                        {renderField('Email', 'email', 'email')}
                        {renderField('Password (min. 6 caratteri)', 'password', 'password')}
                        {renderField('Telefono (Opzionale)', 'phone', 'tel', [], false)}
                        {renderField('Ruolo', 'role', 'select', [{value: 'preposto', label: 'Preposto (Caposquadra)'}, {value: 'admin', label: 'Admin (Amministratore)'}])}
                        {renderSingleCheckbox('Richiedi controllo GPS', 'controlloGpsRichiesto', 'Se deselezionato, questo preposto/admin potrà timbrare ovunque.')}
                    </div>
                );
                break;

            // --- Timbratura Manuale: Corretta per ora e area ---
            case 'manualClockIn':
            case 'adminClockIn':
            case 'manualClockOut':
                const areasList = workAreas.filter(wa => 
                    item?.workAreaIds?.includes(wa.id) || 
                    (userData?.role === 'admin') || // Admin vede tutte le aree
                    (userData?.role === 'preposto' && userData?.managedAreaIds?.includes(wa.id)) // Preposto vede aree gestite
                );

                const isTimbraturaForzata = type === 'manualClockIn' || type === 'adminClockIn';
                
                // La nota è obbligatoria solo per 'adminClockIn' (timbratura forzata per altri)
                const noteIsRequired = type === 'adminClockIn'; 

                body = (
                    <div className="space-y-4">
                        <p className="font-semibold text-gray-800">Dipendente: {item?.name} {item?.surname}</p>
                        
                        {/* CAMPO ORA/DATA */}
                        {renderField(isTimbraturaForzata ? 'Orario di Entrata' : 'Orario di Uscita', 'manualTime', 'datetime-local')}

                        {/* CAMPO AREA */}
                        {isTimbraturaForzata && (
                            areasList.length > 0 ? renderField('Seleziona Area di Lavoro', 'selectedAreaId', 'select', areasList.map(a => ({value: a.id, label: a.name}))) 
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
            case 'deleteAdmin':
            case 'resetDevice':
            case 'applyPredefinedPause':
                body = <p>Sei sicuro di voler procedere? L'azione potrebbe non essere reversibile.</p>;
                break;

            // Caso di errore/default
            default:
                console.warn("Configurazione modale non valida ricevuta:", type);
                body = <p>Configurazione modale non valida.</p>;
                break;
        }

        const submitText = type === 'bypassRestPeriod' ? 'Sblocca' : (type.startsWith('delete') ? 'Elimina' : 'Conferma');
        
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