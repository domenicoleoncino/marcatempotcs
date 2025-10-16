import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, collection, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, user, allEmployees, userData, onAdminClockIn, onAdminApplyPause }) => {
    // Stati generici per i form
    const [formData, setFormData] = useState({});
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Popola i campi del form quando si apre la modale per modificare
    useEffect(() => {
        if (item) {
            if (type === 'editEmployee') {
                setFormData({ name: item.name, surname: item.surname });
            } else if (type === 'editArea') {
                setFormData({ name: item.name, pauseDuration: item.pauseDuration || 0 });
            } else if (type === 'assignArea') {
                setFormData({ selectedAreas: item.workAreaIds || [] });
            } else if (type === 'assignManagedAreas') {
                setFormData({ selectedAreas: item.managedAreaIds || [] });
            } else if (type === 'adminClockIn') {
                // Pre-seleziona la prima area disponibile per il preposto
                const availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                setFormData({ selectedArea: availableAreas.length > 0 ? availableAreas[0].id : '', manualTime: new Date().toISOString().slice(0, 16) });
            } else if (type === 'manualClockIn') {
                 const availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                 setFormData({ selectedArea: availableAreas.length > 0 ? availableAreas[0].id : '', manualTime: new Date().toISOString().slice(0, 16) });
            } else if (type === 'manualClockOut') {
                setFormData({ manualTime: new Date().toISOString().slice(0, 16) });
            } else {
                 setFormData({}); // Resetta per altre modali
            }
        } else {
            setFormData({}); // Resetta per modali di creazione
        }
    }, [item, type, workAreas]);


    const functions = getFunctions();

    // Gestore generico per i cambiamenti negli input
    const handleChange = (e) => {
        const { name, value, type, checked, options } = e.target;
        if (type === 'checkbox') {
             setFormData(prev => ({
                ...prev,
                [name]: checked 
                    ? [...(prev[name] || []), value] 
                    : (prev[name] || []).filter(v => v !== value)
            }));
        } else if (type === 'select-multiple') {
            const values = Array.from(options).filter(option => option.selected).map(option => option.value);
            setFormData(prev => ({...prev, [name]: values}));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    // --- FUNZIONI DI GESTIONE ---

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            switch (type) {
                case 'newEmployee':
                    if (!formData.name || !formData.surname || !formData.email || !formData.password) throw new Error('Tutti i campi sono obbligatori.');
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
                    if (!window.confirm(`Sei sicuro di voler eliminare ${item.name} ${item.surname}? L'operazione è irreversibile.`)) return;
                    const deleteUser = httpsCallable(functions, 'deleteUserAndEmployee');
                    await deleteUser({ userId: item.userId });
                    alert('Dipendente eliminato.');
                    break;

                case 'newArea':
                    if (!formData.name) throw new Error('Il nome dell\'area è obbligatorio.');
                    const createArea = httpsCallable(functions, 'createWorkArea');
                    await createArea({ name: formData.name, pauseDuration: Number(formData.pauseDuration || 0) });
                    alert('Area creata con successo!');
                    break;
                
                case 'editArea':
                    if (!formData.name) throw new Error('Il nome dell\'area è obbligatorio.');
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, pauseDuration: Number(formData.pauseDuration || 0) });
                    alert('Area aggiornata!');
                    break;

                case 'deleteArea':
                    if (!window.confirm(`Sei sicuro di voler eliminare l'area "${item.name}"?`)) return;
                    await deleteDoc(doc(db, "work_areas", item.id));
                    alert('Area eliminata.');
                    break;
                
                case 'assignArea':
                    await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.selectedAreas || [] });
                    alert('Aree assegnate con successo.');
                    break;

                case 'assignManagedAreas':
                    await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.selectedAreas || [] });
                    alert('Aree di gestione assegnate.');
                    break;

                case 'newAdmin':
                    if (!formData.name || !formData.surname || !formData.email || !formData.password || !formData.role) throw new Error('Tutti i campi sono obbligatori.');
                     const createAdminFn = httpsCallable(functions, 'createUser');
                    await createAdminFn({ ...formData, createdBy: user.uid });
                    alert('Utente amministrativo creato!');
                    break;

                case 'deleteAdmin':
                     if (!window.confirm(`Sei sicuro di voler eliminare l'utente ${item.name} ${item.surname}?`)) return;
                     const deleteAdminFn = httpsCallable(functions, 'deleteUserAndEmployee');
                     await deleteAdminFn({ userId: item.id }); // L'ID dell'admin è l'UID dell'utente
                     alert('Utente eliminato.');
                     break;
                
                case 'resetDevice':
                    if (!window.confirm(`Resettare il dispositivo per ${item.name} ${item.surname}? Dovrà effettuare di nuovo il login.`)) return;
                    await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                    alert('Dispositivo resettato.');
                    break;
                
                case 'manualClockIn':
                case 'adminClockIn':
                    if (!formData.selectedArea || !formData.manualTime) throw new Error('Seleziona un\'area e un orario.');
                    const clockInFunction = httpsCallable(functions, 'manualClockIn');
                    await clockInFunction({ employeeId: item.id, workAreaId: formData.selectedArea, timestamp: formData.manualTime, adminId: user.uid });
                    alert('Timbratura di entrata registrata.');
                    break;
                
                case 'manualClockOut':
                    if (!formData.manualTime) throw new Error('Seleziona un orario.');
                    const clockOutFunction = httpsCallable(functions, 'manualClockOut');
                    await clockOutFunction({ employeeId: item.id, timestamp: formData.manualTime, adminId: user.uid });
                    alert('Timbratura di uscita registrata.');
                    break;
                
                case 'applyPredefinedPause':
                    if (!window.confirm(`Applicare la pausa predefinita a ${item.name} ${item.surname}?`)) return;
                    await onAdminApplyPause(item);
                    break;
                
                case 'assignEmployeeToArea':
                     if (!formData.employees || formData.employees.length === 0 || !formData.areas || formData.areas.length === 0) throw new Error('Seleziona almeno un dipendente e un\'area.');
                     const batch = writeBatch(db);
                     formData.employees.forEach(empId => {
                         const employeeRef = doc(db, "employees", empId);
                         batch.update(employeeRef, { workAreaIds: formData.areas });
                     });
                     await batch.commit();
                     alert('Aree assegnate con successo ai dipendenti selezionati.');
                     break;

                default:
                    throw new Error("Azione non riconosciuta.");
            }
            onDataUpdate(); // Aggiorna i dati nella dashboard
            setShowModal(false); // Chiude la modale
        } catch (err) {
            console.error("Errore durante l'operazione:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    // --- RENDER DEI CONTENUTI DELLA MODALE ---

    const renderContent = () => {
        const title = {
            newEmployee: 'Aggiungi Nuovo Dipendente',
            editEmployee: `Modifica ${item?.name} ${item?.surname}`,
            deleteEmployee: `Elimina ${item?.name} ${item?.surname}`,
            newArea: 'Aggiungi Nuova Area',
            editArea: `Modifica Area "${item?.name}"`,
            deleteArea: `Elimina Area "${item?.name}"`,
            assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
            newAdmin: 'Aggiungi Personale Amministrativo',
            deleteAdmin: `Elimina ${item?.name} ${item?.surname}`,
            resetDevice: `Resetta Dispositivo per ${item?.name}`,
            manualClockIn: `Timbratura Manuale Entrata`,
            manualClockOut: `Timbratura Manuale Uscita`,
            adminClockIn: `Timbra Entrata per te`,
            assignManagedAreas: `Assegna Aree a ${item?.name}`,
            applyPredefinedPause: `Applica Pausa a ${item?.name}`,
            assignEmployeeToArea: 'Assegna Dipendenti a Aree'
        }[type] || 'Conferma Azione';

        const renderField = (label, name, type = 'text', options = []) => (
            <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                {type === 'select' ? (
                     <select id={name} name={name} value={formData[name] || ''} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                     </select>
                ) : (
                    <input id={name} name={name} type={type} value={formData[name] || ''} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
                )}
            </div>
        );
        
        const renderCheckboxes = (label, name, items) => (
             <div>
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-2">
                    {items.map(area => (
                        <div key={area.id} className="flex items-center">
                            <input id={`${name}-${area.id}`} name={name} type="checkbox" value={area.id} checked={(formData[name] || []).includes(area.id)} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                            <label htmlFor={`${name}-${area.id}`} className="ml-3 block text-sm text-gray-800">{area.name}</label>
                        </div>
                    ))}
                </div>
            </div>
        );
         
         const renderMultiSelect = (label, name, items) => (
             <div>
                <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
                <select multiple id={name} name={name} value={formData[name] || []} onChange={handleChange} className="mt-1 block w-full h-40 border border-gray-300 rounded-md">
                     {items.map(i => <option key={i.id} value={i.id}>{i.name} {i.surname || ''}</option>)}
                </select>
            </div>
         );

        let body;
        switch (type) {
            case 'newEmployee':
                body = <div className="space-y-4">
                    {renderField('Nome', 'name')}
                    {renderField('Cognome', 'surname')}
                    {renderField('Email', 'email', 'email')}
                    {renderField('Password', 'password', 'password')}
                </div>;
                break;
            case 'editEmployee':
                body = <div className="space-y-4">
                    {renderField('Nome', 'name')}
                    {renderField('Cognome', 'surname')}
                </div>;
                break;
            case 'deleteEmployee': case 'deleteArea': case 'deleteAdmin': case 'resetDevice': case 'applyPredefinedPause':
                body = <p>Sei sicuro di voler procedere con questa azione?</p>;
                break;
            case 'newArea':
                 body = <div className="space-y-4">
                    {renderField('Nome Area', 'name')}
                    {renderField('Durata Pausa (minuti)', 'pauseDuration', 'number')}
                </div>;
                break;
            case 'editArea':
                body = <div className="space-y-4">
                    {renderField('Nome Area', 'name')}
                    {renderField('Durata Pausa (minuti)', 'pauseDuration', 'number')}
                </div>;
                break;
            case 'assignArea': case 'assignManagedAreas':
                body = renderCheckboxes('Aree', 'selectedAreas', workAreas);
                break;
            case 'newAdmin':
                 body = <div className="space-y-4">
                    {renderField('Nome', 'name')}
                    {renderField('Cognome', 'surname')}
                    {renderField('Email', 'email', 'email')}
                    {renderField('Password', 'password', 'password')}
                    {renderField('Ruolo', 'role', 'select', [{value: 'preposto', label: 'Preposto'}])}
                </div>;
                break;
            case 'manualClockIn': case 'adminClockIn':
                const availableAreas = workAreas.filter(wa => item.workAreaIds?.includes(wa.id));
                 body = <div className="space-y-4">
                     {renderField('Orario di Entrata', 'manualTime', 'datetime-local')}
                     {renderField('Area di Lavoro', 'selectedArea', 'select', availableAreas.map(a => ({value: a.id, label: a.name})))}
                </div>;
                break;
            case 'manualClockOut':
                 body = renderField('Orario di Uscita', 'manualTime', 'datetime-local');
                 break;
            case 'assignEmployeeToArea':
                 body = <div className="space-y-4">
                    {renderMultiSelect('Seleziona Dipendenti', 'employees', allEmployees)}
                    {renderMultiSelect('Assegna ad Aree', 'areas', workAreas)}
                 </div>;
                 break;
            default:
                body = <p>Contenuto non disponibile.</p>;
        }

        return (
            <form onSubmit={handleSubmit}>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">{title}</h3>
                {error && <p className="text-red-500 text-sm mb-4 bg-red-100 p-2 rounded">{error}</p>}
                
                <div className="mb-6">{body}</div>

                <div className="flex justify-end space-x-3 border-t pt-4">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                    <button type="submit" disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">
                        {isLoading ? 'Salvataggio...' : 'Conferma'}
                    </button>
                </div>
            </form>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg transform transition-all duration-300 scale-95 hover:scale-100">
                <div className="p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default AdminModal;