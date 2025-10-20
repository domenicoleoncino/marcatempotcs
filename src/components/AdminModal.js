import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, user, allEmployees, userData, onAdminClockIn, onAdminApplyPause }) => {
    // Stati generici per i form
    const [formData, setFormData] = useState({});
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Popola i campi del form quando si apre la modale per modificare
    useEffect(() => {
        // Resetta lo stato ad ogni apertura
        setFormData({});
        setError('');

        if (item) { // Modal di modifica o azione su item esistente
            if (type === 'editEmployee') {
                setFormData({ name: item.name, surname: item.surname });
            } else if (type === 'editArea') {
                setFormData({ 
                    name: item.name, 
                    pauseDuration: item.pauseDuration || 0,
                    latitude: item.latitude || '',
                    longitude: item.longitude || '',
                    radius: item.radius || ''
                });
            } else if (type === 'assignArea') { // Admin assegna a qualsiasi area
                setFormData({ selectedAreas: item.workAreaIds || [] });
            } else if (type === 'assignManagedAreas') { // Admin assegna aree gestite a preposto
                setFormData({ selectedAreas: item.managedAreaIds || [] });
            } else if (type === 'adminClockIn') { // Admin/Preposto timbra per sé
                const profile = item; // 'item' è adminEmployeeProfile qui
                const availableAreas = workAreas.filter(wa => profile.workAreaIds?.includes(wa.id));
                setFormData({ selectedArea: availableAreas.length > 0 ? availableAreas[0].id : '', manualTime: new Date().toISOString().slice(0, 16) });
            } else if (type === 'manualClockIn') { // Timbratura manuale per dipendente
                 const availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                 setFormData({ selectedArea: availableAreas.length > 0 ? availableAreas[0].id : '', manualTime: new Date().toISOString().slice(0, 16) });
            } else if (type === 'manualClockOut') { // Timbratura manuale uscita
                setFormData({ manualTime: new Date().toISOString().slice(0, 16) });
            } else if (type === 'assignEmployeeToPrepostoArea') { // Preposto assegna dipendente alle sue aree
                 const managedAreaIds = userData?.managedAreaIds || [];
                 const preExistingAssignments = (item.workAreaIds || []).filter(id => managedAreaIds.includes(id));
                 setFormData({ selectedPrepostoAreas: preExistingAssignments });
            } 
            
        } else { // Modal di creazione
            if (type === 'newArea') {
                setFormData({ // Default per nuova area
                    name: '',
                    pauseDuration: 0,
                    latitude: '',
                    longitude: '',
                    radius: 100 
                });
            } else if (type === 'newEmployee') {
                 setFormData({name: '', surname: '', email: '', password: ''});
            } else if (type === 'newAdmin') {
                setFormData({name: '', surname: '', email: '', password: '', phone: '', role: 'preposto'});
            }
        }
    }, [item, type, workAreas, userData]); 


    // --- Specifica la regione corretta ---
    const functions = getFunctions(undefined, 'europe-west1');


    // Gestore generico per i cambiamenti negli input
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target; 
        
        if (type === 'checkbox') {
             const currentSelection = formData[name] || [];
             if (checked) { 
                 setFormData(prev => ({ ...prev, [name]: [...currentSelection, value] }));
             } else { 
                 setFormData(prev => ({ ...prev, [name]: currentSelection.filter(id => id !== value) }));
             }
        } 
        else if (e.target.multiple) { 
             const values = Array.from(e.target.selectedOptions).map(option => option.value);
             setFormData(prev => ({...prev, [name]: values}));
        } 
        else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    // --- FUNZIONI DI GESTIONE SUBMIT ---
    const handleSubmit = async (e) => {
        e.preventDefault(); 
        setIsLoading(true);
        setError(''); 

        console.log("Submit modal:", type, "con dati:", formData);

        try {
            switch (type) {
                // --- DIPENDENTI ---
                case 'newEmployee':
                    if (!formData.name || !formData.surname || !formData.email || !formData.password) throw new Error('Nome, Cognome, Email e Password sono obbligatori.');
                    const createUser = httpsCallable(functions, 'createUser');
                    await createUser({ ...formData, role: 'dipendente', createdBy: user.uid }); 
                    alert('Dipendente creato con successo!');
                    break;
                case 'editEmployee':
                    if (!formData.name || !formData.surname) throw new Error('Nome e cognome sono obbligatori.');
                    await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname });
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

                // --- AREE DI LAVORO ---
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

                // --- ASSEGNAZIONI ---
                case 'assignArea': 
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.selectedAreas || [] });
                    alert('Aree assegnate con successo al dipendente.');
                    break;
                case 'assignManagedAreas': 
                    await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.selectedAreas || [] });
                    alert('Aree di gestione assegnate al preposto.');
                    break;
                case 'assignEmployeeToPrepostoArea': 
                    const selectedIds = formData.selectedPrepostoAreas || [];
                    const prepostoAssign = httpsCallable(functions, 'prepostoAssignEmployeeToArea');
                    await prepostoAssign({ employeeId: item.id, areaIds: selectedIds });
                    alert('Aree di competenza aggiornate per il dipendente.');
                    break;
                
                // --- ADMIN/PREPOSTI ---
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
                
                // --- TIMBRATURE MANUALI ---
                case 'manualClockIn': 
                case 'adminClockIn': 
                    if (!formData.selectedArea || !formData.manualTime) throw new Error('Seleziona un\'area e un orario di entrata.');
                    const clockInFunction = httpsCallable(functions, 'manualClockIn'); 
                    await clockInFunction({ employeeId: item.id, workAreaId: formData.selectedArea, timestamp: formData.manualTime, adminId: user.uid });
                    alert('Timbratura di entrata registrata.');
                    break;
                case 'manualClockOut': 
                     if (!formData.manualTime) throw new Error('Seleziona un orario di uscita.');
                     if (!item || !item.activeEntry) { throw new Error("Impossibile timbrare uscita: il dipendente non risulta attualmente al lavoro."); }
                     const clockOutFunction = httpsCallable(functions, 'manualClockOut');
                     await clockOutFunction({ employeeId: item.id, timestamp: formData.manualTime, adminId: user.uid });
                     alert('Timbratura di uscita registrata.');
                     break;
                
                // --- PAUSE ---
                case 'applyPredefinedPause': 
                    await onAdminApplyPause(item); 
                    setIsLoading(false); 
                    return; 

                // --- DEFAULT ---
                default:
                    console.error("Tipo di modal non gestito:", type);
                    throw new Error("Azione modale non riconosciuta.");
            }

            await onDataUpdate(); 
            setShowModal(false); 

        } catch (err) {
            console.error(`Errore durante l'operazione '${type}':`, err);
            setError(err.message || "Si è verificato un errore sconosciuto.");
        } finally {
            setIsLoading(false); 
        }
    };
    
    // --- RENDER DEI CONTENUTI SPECIFICI DELLA MODALE ---
    const renderContent = () => {
        // Titoli per ogni tipo di modale
        const title = {
            newEmployee: 'Aggiungi Nuovo Dipendente',
            editEmployee: `Modifica ${item?.name} ${item?.surname}`,
            deleteEmployee: `Elimina ${item?.name} ${item?.surname}`,
            newArea: 'Aggiungi Nuova Area di Lavoro',
            editArea: `Modifica Area "${item?.name}"`,
            deleteArea: `Elimina Area "${item?.name}"`,
            assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
            assignManagedAreas: `Assegna Aree Gestite a ${item?.name} ${item?.surname}`,
            newAdmin: 'Aggiungi Personale Amministrativo',
            deleteAdmin: `Elimina ${item?.name} ${item?.surname} (${item?.role})`,
            resetDevice: `Resetta Dispositivo per ${item?.name} ${item?.surname}`,
            manualClockIn: `Timbratura Manuale Entrata per ${item?.name} ${item?.surname}`,
            manualClockOut: `Timbratura Manuale Uscita per ${item?.name} ${item?.surname}`,
            adminClockIn: `Timbra Entrata per Te (${item?.name} ${item?.surname})`, 
            applyPredefinedPause: `Applica Pausa Predefinita a ${item?.name} ${item?.surname}`,
            assignEmployeeToPrepostoArea: `Assegna ${item?.name} ${item?.surname} alle Tue Aree`
        }[type] || 'Conferma Azione';

        // Helper per renderizzare campi input/select standard
        const renderField = (label, name, type = 'text', options = [], required = true) => (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                {type === 'select' ? (
                     <select 
                        id={name} name={name} value={formData[name] ?? ''} onChange={handleChange} 
                        required={required}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
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
        
        // Helper per renderizzare checkbox (usato per assegnare aree)
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
        
        // --- FUNZIONE renderMultiSelect COMMENTATA PER FIX BUILD CI ---
        /*
         const renderMultiSelect = (label, name, items) => (
             <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                <select multiple id={name} name={name} value={formData[name] || []} onChange={handleChange} className="mt-1 block w-full h-40 border border-gray-300 rounded-md">
                     {items.map(i => <option key={i.id} value={i.id}>{i.name} {i.surname || ''}</option>)}
                </select>
            </div>
         );
        */

        // Contenuto specifico del body del modal
        let body;
        switch (type) {
            // ---- Form Dipendenti ----
            case 'newEmployee': /* ... come prima ... */ break;
            case 'editEmployee': /* ... come prima ... */ break;
            // ---- Form Aree ----
            case 'newArea': case 'editArea': /* ... come prima ... */ break;
             // ---- Form Assegnazioni ----
            case 'assignArea': /* ... come prima ... */ break;
            case 'assignManagedAreas': /* ... come prima ... */ break;
             case 'assignEmployeeToPrepostoArea': /* ... come prima ... */ break;
            // ---- Form Admin/Preposti ----
            case 'newAdmin': /* ... come prima ... */ break;
            // ---- Form Timbrature Manuali ----
            case 'manualClockIn': case 'adminClockIn': /* ... come prima ... */ break;
            case 'manualClockOut': /* ... come prima ... */ break;
            // ---- Messaggi di Conferma ----
            case 'deleteEmployee': case 'deleteArea': case 'deleteAdmin': case 'resetDevice': case 'applyPredefinedPause': /* ... come prima ... */ break;
            // ---- Default ----
            default: /* ... come prima ... */ break;
        }

         // Assegna il body corretto in base al type (codice omesso per brevità, è uguale a prima)
         switch (type) {
            case 'newEmployee': body = <div className="space-y-4">{renderField('Nome', 'name')}{renderField('Cognome', 'surname')}{renderField('Email', 'email', 'email')}{renderField('Password (min. 6 caratteri)', 'password', 'password')}</div>; break;
            case 'editEmployee': body = <div className="space-y-4">{renderField('Nome', 'name')}{renderField('Cognome', 'surname')}</div>; break;
            case 'newArea': case 'editArea': body = <div className="space-y-4">{renderField('Nome Area', 'name')}{renderField('Durata Pausa Predefinita (minuti)', 'pauseDuration', 'number', [], false)}{renderField('Latitudine', 'latitude', 'number')}{renderField('Longitudine', 'longitude', 'number')}{renderField('Raggio di Tolleranza (metri)', 'radius', 'number')}</div>; break;
            case 'assignArea': body = renderCheckboxes('Seleziona le aree per questo dipendente', 'selectedAreas', workAreas); break;
            case 'assignManagedAreas': body = renderCheckboxes('Seleziona le aree che questo preposto gestirà', 'selectedAreas', workAreas); break;
            case 'assignEmployeeToPrepostoArea': const managedAreas = workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id)); body = renderCheckboxes('Seleziona le aree di tua competenza per questo dipendente', 'selectedPrepostoAreas', managedAreas, managedAreas.length === 0); if (managedAreas.length === 0 && !isLoading) { setError("Non gestisci nessuna area specifica. Contatta l'amministratore per farti assegnare delle aree."); } break;
            case 'newAdmin': body = <div className="space-y-4">{renderField('Nome', 'name')}{renderField('Cognome', 'surname')}{renderField('Email', 'email', 'email')}{renderField('Password (min. 6 caratteri)', 'password', 'password')}{renderField('Telefono (Opzionale)', 'phone', 'tel', [], false)}{renderField('Ruolo', 'role', 'select', [{value: 'preposto', label: 'Preposto (Caposquadra)'}, {value: 'admin', label: 'Admin (Amministratore)'}])}</div>; break;
            case 'manualClockIn': case 'adminClockIn': const employeeWorkAreaIds = item?.workAreaIds || []; const availableAreas = workAreas.filter(wa => employeeWorkAreaIds.includes(wa.id)); body = <div className="space-y-4">{renderField('Orario di Entrata', 'manualTime', 'datetime-local')}{availableAreas.length > 0 ? renderField('Seleziona Area di Lavoro', 'selectedArea', 'select', availableAreas.map(a => ({value: a.id, label: a.name}))) : <p className="text-sm text-red-500">Questo utente non è assegnato a nessuna area.</p>}</div>; if (availableAreas.length === 0) setIsLoading(true); break;
            case 'manualClockOut': body = renderField('Orario di Uscita', 'manualTime', 'datetime-local'); break;
            case 'deleteEmployee': case 'deleteArea': case 'deleteAdmin': case 'resetDevice': case 'applyPredefinedPause': body = <p>Sei sicuro di voler procedere? L'azione potrebbe non essere reversibile.</p>; break;
            default: body = <p>Configurazione modale non valida.</p>; setIsLoading(true); break;
        }

        // --- Render Finale del Form ---
        return (
            <form onSubmit={handleSubmit}>
                <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-4">{title}</h3>
                {error && <p className="text-sm text-red-600 mb-4 bg-red-100 p-3 rounded border border-red-200">{error}</p>}
                <div className="mb-6">{body}</div>
                <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4 mt-6">
                    <button type="button" onClick={() => { setError(''); setShowModal(false); }} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">Annulla</button>
                    <button type="submit" disabled={isLoading || (type === 'assignEmployeeToPrepostoArea' && workAreas.filter(wa => userData?.managedAreaIds?.includes(wa.id)).length === 0) || (type === 'manualClockIn' && workAreas.filter(wa => item?.workAreaIds?.includes(wa.id)).length === 0)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        {isLoading ? 'Salvataggio...' : (type.startsWith('delete') ? 'Elimina' : 'Conferma')}
                    </button>
                </div>
            </form>
        );
    };

    // --- Render Struttura Modale ---
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4 transition-opacity duration-300 ease-out" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-auto transform transition-all duration-300 ease-out sm:my-8" role="document">
                <div className="p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default AdminModal;