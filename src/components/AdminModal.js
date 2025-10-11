import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, deleteDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- FUNZIONE DI ARROTONDAMENTO ---
const roundTimeWithCustomRules = (date, type) => {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) { newDate.setHours(newDate.getHours() + 1); newDate.setMinutes(0); }
        else if (minutes >= 16) { newDate.setMinutes(30); }
        else { newDate.setMinutes(0); }
    } else if (type === 'uscita') {
        if (minutes >= 30) { newDate.setMinutes(30); }
        else { newDate.setMinutes(0); }
    }
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};


const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees, currentUserRole, userData, onAdminClockIn, onAdminApplyPause }) => {
    const [formData, setFormData] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.workAreaIds || [];
        if (checked) {
            setFormData({ ...formData, workAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, workAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    const handleManagedAreasChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.managedAreaIds || [];
        if (checked) {
            setFormData({ ...formData, managedAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, managedAreaIds: currentAreas.filter(id => id !== name) });
        }
    };
    
    useEffect(() => {
        if (type === 'assignEmployeeToArea') {
            setFormData({}); 
        } else if (type === 'assignArea') {
             setFormData({ ...item, workAreaIds: item.workAreaIds || [] });
        } else if (type === 'manualClockIn' || type === 'manualClockOut' || type === 'adminClockIn') {
             const now = new Date();
             now.setSeconds(0);
             now.setMilliseconds(0);
             const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
             setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        } else {
            setFormData(item ? { ...item, nome: item.nome || item.name, cognome: item.cognome || item.surname } : {});
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const functions = getFunctions();
            
            if (user && (type === 'fixUserRole' || type === 'resetDevice')) {
                await user.getIdToken(true);
            }
            
            switch (type) {
                case 'newEmployee':
                case 'newAdmin':
                    if (!formData.password || formData.password.length < 6) {
                        throw new Error("La password deve essere di almeno 6 caratteri.");
                    }
                    const createNewUser = httpsCallable(functions, 'createNewUser');
                    const newUserPayload = {
                        email: formData.email,
                        password: formData.password,
                        nome: formData.nome,
                        cognome: formData.cognome,
                        telefono: formData.telefono || '',
                        role: type === 'newEmployee' ? 'employee' : (formData.role || 'preposto'),
                    };
                    await createNewUser(newUserPayload);
                    break;
                
                case 'editAdmin':
                     await updateDoc(doc(db, "users", item.id), { nome: formData.nome, cognome: formData.cognome, role: formData.role });
                     break;

                case 'fixUserRole':
                    if (!formData.targetUid) {
                        throw new Error("L'UID del dipendente è obbligatorio.");
                    }
                    const setEmployeeRole = httpsCallable(functions, 'setEmployeeRole');
                    await setEmployeeRole({ targetUid: formData.targetUid });
                    alert('Ruolo impostato con successo! Il dipendente ora può accedere.');
                    break;

                case 'assignEmployeeToArea':
                    const { employeeId, workAreaIds } = formData;
                    if (!employeeId || !workAreaIds || workAreaIds.length === 0) {
                        throw new Error("Seleziona un dipendente e almeno un'area.");
                    }
                    const empRefForAssign = doc(db, "employees", employeeId);
                    const empDocForAssign = await getDoc(empRefForAssign);
                    if(!empDocForAssign.exists()) throw new Error("Dipendente non trovato.");
                    const currentWorkAreaIds = empDocForAssign.data().workAreaIds || [];
                    const newTotalWorkAreaIds = [...new Set([...currentWorkAreaIds, ...workAreaIds])];
                    await updateDoc(empRefForAssign, { workAreaIds: newTotalWorkAreaIds });
                    break;
                
                case 'assignArea':
                    const empRefForManage = doc(db, "employees", item.id);
                    if (currentUserRole === 'preposto') {
                        const managedAreaIds = userData.managedAreaIds || [];
                        const otherAreaIds = (item.workAreaIds || []).filter(id => !managedAreaIds.includes(id));
                        const newWorkAreaIds = [...new Set([...otherAreaIds, ...(formData.workAreaIds || [])])];
                        await updateDoc(empRefForManage, { workAreaIds: newWorkAreaIds });
                    } else { // Admin
                        await updateDoc(empRefForManage, { workAreaIds: formData.workAreaIds || [] });
                    }
                    break;
                
                case 'manualClockIn':
                    const clockInFunction = httpsCallable(functions, 'clockEmployeeIn');
                    await clockInFunction({
                        targetEmployeeId: item.id,
                        areaId: formData.workAreaId,
                        timestamp: formData.timestamp,
                        note: formData.note || null
                    });
                    break;

                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), { 
                        clockOutTime: roundTimeWithCustomRules(new Date(formData.timestamp), 'uscita'), 
                        status: 'clocked-out', 
                        note: formData.note || item.activeEntry.note || null,
                        createdBy: user.uid
                    });
                    break;
                
                case 'resetDevice':
                    const resetDeviceFunction = httpsCallable(functions, 'resetEmployeeDevice');
                    await resetDeviceFunction({ employeeId: item.id });
                    alert('Dispositivi resettati con successo.');
                    break;

                case 'editEmployee':
                     await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                     break;
                case 'deleteEmployee':
                     await deleteDoc(doc(db, "employees", item.id));
                     break;
                case 'newArea':
                case 'editArea':
                    const areaPayload = { 
                        name: formData.name, 
                        latitude: parseFloat(formData.latitude), 
                        longitude: parseFloat(formData.longitude), 
                        radius: parseInt(formData.radius, 10),
                        pauseDuration: parseInt(formData.pauseDuration || 0, 10)
                    };
                    if (type === 'newArea') {
                        await addDoc(collection(db, "work_areas"), areaPayload);
                    } else {
                        await updateDoc(doc(db, "work_areas", item.id), areaPayload);
                    }
                    break;
                case 'deleteArea':
                    await deleteDoc(doc(db, "work_areas", item.id));
                    break;
                case 'deleteAdmin':
                    if (item.email === superAdminEmail) { throw new Error("Non puoi eliminare il Super Admin."); }
                    await deleteDoc(doc(db, "users", item.id));
                    break;
                case 'assignManagedAreas':
                    await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.managedAreaIds || [] });
                    break;
                case 'adminClockIn':
                    await onAdminClockIn(formData.workAreaId, formData.timestamp);
                    break;
                case 'applyPredefinedPause':
                    await onAdminApplyPause(item);
                    break;
                default:
                    console.log("Azione non gestita:", type);
            }
            
            if(onDataUpdate) await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error("Errore nell'handleSubmit:", err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const titles = {
        newEmployee: 'Aggiungi Nuovo Dipendente',
        editEmployee: 'Modifica Dati Dipendente',
        deleteEmployee: 'Elimina Dipendente',
        newArea: 'Aggiungi Nuova Area',
        editArea: 'Modifica Area di Lavoro',
        deleteArea: 'Elimina Area di Lavoro',
        assignArea: `Gestisci Aree per ${item?.name} ${item?.surname}`,
        newAdmin: 'Aggiungi Personale Amministrativo',
        editAdmin: `Modifica Utente ${item?.nome} ${item?.cognome}`,
        deleteAdmin: 'Elimina Personale Amministrativo',
        assignManagedAreas: `Assegna Aree a Preposto ${item?.name}`,
        manualClockIn: `Timbra Entrata per ${item?.name} ${item?.surname}`,
        manualClockOut: `Timbra Uscita per ${item?.name} ${item?.surname}`,
        resetDevice: `Resetta Dispositivi di ${item?.name} ${item?.surname}`,
        adminClockIn: `Timbra Entrata Personale`,
        assignEmployeeToArea: 'Assegna Dipendente ad Aree',
        applyPredefinedPause: `Applica Pausa a ${item?.name} ${item?.surname}`,
        fixUserRole: 'Sblocca Dipendente Bloccato'
    };

    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'newAdmin':
                return ( <div className="space-y-4">
                    <input name="nome" value={formData.nome || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                    <input name="cognome" value={formData.cognome || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                    <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                    <input name="telefono" value={formData.telefono || ''} onChange={handleInputChange} placeholder="Telefono (opzionale)" className="w-full p-2 border rounded" />
                    {type === 'newAdmin' && currentUserRole === 'admin' && (
                        <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                            <option value="preposto">Preposto</option>
                            <option value="admin">Admin</option>
                        </select>
                    )}
                </div> );

            case 'editAdmin':
                return ( <div className="space-y-4">
                    <input name="nome" value={formData.nome || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                    <input name="cognome" value={formData.cognome || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                     <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                        <option value="preposto">Preposto</option>
                        <option value="admin">Admin</option>
                    </select>
                </div> );

            case 'fixUserRole':
                return ( <div className="space-y-4">
                    <label htmlFor="targetUid" className="block text-sm font-medium text-gray-700">UID Dipendente</label>
                    <input name="targetUid" id="targetUid" value={formData.targetUid || ''} onChange={handleInputChange} placeholder="Incolla qui l'UID del dipendente" required className="w-full p-2 border rounded" />
                </div> );

            case 'assignEmployeeToArea':
                const prepostoAreas = workAreas.filter(area => userData.managedAreaIds.includes(area.id));
                return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700">Seleziona Dipendente</label>
                            <select name="employeeId" value={formData.employeeId || ''} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="">-- Scegli un dipendente --</option>
                                {allEmployees.sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Seleziona Aree di Competenza</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto mt-2 border p-2 rounded-md">
                                {prepostoAreas.map(area => (
                                    <div key={area.id} className="flex items-center">
                                        <input type="checkbox" id={area.id} name={area.id} onChange={handleCheckboxChange} className="h-4 w-4" />
                                        <label htmlFor={area.id} className="ml-2">{area.name}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            
            case 'assignArea':
                const availableAreas = currentUserRole === 'preposto' 
                    ? workAreas.filter(area => userData.managedAreaIds.includes(area.id))
                    : workAreas;
                return (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        <p className="text-sm text-gray-600">Seleziona le aree per <strong>{item.name} {item.surname}</strong>.</p>
                        {availableAreas.map(area => (
                            <div key={area.id} className="flex items-center">
                                <input type="checkbox" id={area.id} name={area.id} checked={formData.workAreaIds?.includes(area.id) || false} onChange={handleCheckboxChange} className="h-4 w-4" />
                                <label htmlFor={area.id} className="ml-2">{area.name}</label>
                            </div>
                        ))}
                    </div>
                );
            
            case 'manualClockIn':
                return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-1">Data e Ora di Entrata</label>
                            <input type="datetime-local" id="timestamp" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="workAreaId" className="block text-sm font-medium text-gray-700 mb-1">Area di Lavoro</label>
                            <select name="workAreaId" id="workAreaId" value={formData.workAreaId || ''} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="">Seleziona Area</option>
                                {(item.workAreaIds || []).map(areaId => {
                                    const area = workAreas.find(a => a.id === areaId);
                                    return area ? <option key={area.id} value={area.id}>{area.name}</option> : null;
                                })}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                            <textarea name="note" id="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Aggiungi una nota..." className="w-full p-2 border rounded"></textarea>
                        </div>
                    </div>
                );

            case 'manualClockOut':
                 return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-1">Data e Ora di Uscita</label>
                            <input type="datetime-local" id="timestamp" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                            <textarea name="note" id="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Aggiungi o modifica una nota..." className="w-full p-2 border rounded"></textarea>
                        </div>
                    </div>
                 );
            
            case 'assignManagedAreas':
                return ( <div className="space-y-2 max-h-60 overflow-y-auto">
                    {workAreas.map(area => (
                        <div key={area.id} className="flex items-center">
                            <input type="checkbox" id={area.id} name={area.id} checked={formData.managedAreaIds?.includes(area.id) || false} onChange={handleManagedAreasChange} className="h-4 w-4" />
                            <label htmlFor={area.id} className="ml-2">{area.name}</label>
                        </div>
                    ))}
                </div> );

            // ... altri case per conferme di eliminazione etc.
            case 'deleteEmployee': return <p>Sei sicuro di voler eliminare il dipendente <strong>{item.name} {item.surname}</strong>?</p>;
            case 'deleteArea': return <p>Sei sicuro di voler eliminare l'area <strong>{item.name}</strong>?</p>;
            case 'deleteAdmin': return <p>Sei sicuro di voler eliminare l'utente <strong>{item.nome} {item.cognome}</strong>?</p>;
            case 'resetDevice': return <p>Sei sicuro di voler resettare i dispositivi per <strong>{item.name} {item.surname}</strong>?</p>;
            case 'applyPredefinedPause':  return <p>Sei sicuro di voler applicare la pausa predefinita a <strong>{item.name} {item.surname}</strong>?</p>;

            default: return null;
        }
    };

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 m-4 max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">{titles[type] || 'Azione'}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="text-2xl">&times;</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">{renderForm()}</div>
                    {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                        <button type="submit" disabled={isLoading} className={`px-4 py-2 text-white rounded-md ${type.includes('delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-gray-400 flex items-center gap-2`}>
                            {isLoading ? 'Caricamento...' : (type.includes('delete') ? 'Conferma' : 'Salva')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminModal;

