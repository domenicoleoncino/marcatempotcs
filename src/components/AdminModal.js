import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// =================================================================================
// NUOVA FUNZIONE DI ARROTONDAMENTO DEFINITIVA
// =================================================================================
const roundTimeWithCustomRules = (date, type) => {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();

    if (type === 'entrata') {
        // Logica di ENTRATA (confermata)
        if (minutes >= 46) {
            newDate.setHours(newDate.getHours() + 1);
            newDate.setMinutes(0);
        } else if (minutes >= 16) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
        // Logica di USCITA (standard proposta)
        if (minutes >= 30) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    }

    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};


const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees, currentUserRole, userData, onAdminClockIn }) => {
    const [formData, setFormData] = useState(item || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.workAreaIds || item?.workAreaIds || [];
        if (checked) {
            setFormData({ ...formData, workAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, workAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    const handleManagedAreasChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.managedAreaIds || item?.managedAreaIds || [];
        if (checked) {
            setFormData({ ...formData, managedAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, managedAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    useEffect(() => {
        if (type === 'manualClockIn' || type === 'manualClockOut' || type === 'adminClockIn') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        } else {
            setFormData(item ? { ...item } : {});
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && (!formData.password || formData.password.length < 6)) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        if (type === 'deleteAdmin' && item.id === user.uid) {
            setError("Non puoi eliminare te stesso.");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // MODIFICA CRUCIALE: Passa anche il timestamp alla funzione del genitore
            if (type === 'adminClockIn') {
                await onAdminClockIn(formData.workAreaId, formData.timestamp);
            } else if (type === 'newEmployee' || type === 'newAdmin') {
                await user.getIdToken(true); 
                const functions = getFunctions(undefined, 'us-central1');
                const createNewUser = httpsCallable(functions, 'createNewUser');

                const newUserPayload = {
                    email: formData.email.toLowerCase().trim(),
                    password: formData.password,
                    name: formData.name,
                    surname: formData.surname,
                    phone: formData.phone || "",
                    role: type === 'newEmployee' ? 'employee' : (formData.role || 'preposto'),
                };

                if (currentUserRole === 'preposto' && type === 'newEmployee') {
                    newUserPayload.managedAreaIds = userData.managedAreaIds || [];
                    newUserPayload.managedAreaNames = userData.managedAreaNames || [];
                }

                await createNewUser(newUserPayload);

            } else {
                switch (type) {
                    case 'assignEmployeeToArea':
                        const empRef = doc(db, "employees", formData.employeeId);
                        const empDoc = await getDoc(empRef);
                        if (empDoc.exists()) {
                            const currentWorkAreaIds = empDoc.data().workAreaIds || [];
                            const newWorkAreaIds = [...new Set([...currentWorkAreaIds, ...(formData.workAreaIds || [])])];
                            const newWorkAreaNames = workAreas.filter(area => newWorkAreaIds.includes(area.id)).map(area => area.name);
                            await updateDoc(empRef, { workAreaIds: newWorkAreaIds, workAreaNames: newWorkAreaNames });
                        }
                        break;
                    case 'editEmployee':
                        await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                        break;
                    case 'deleteEmployee':
                        await deleteDoc(doc(db, "employees", item.id));
                        break;
                    case 'newArea':
                        await addDoc(collection(db, "work_areas"), { 
                            name: formData.name, 
                            latitude: parseFloat(formData.latitude), 
                            longitude: parseFloat(formData.longitude), 
                            radius: parseInt(formData.radius, 10),
                            pauseDuration: parseInt(formData.pauseDuration || 0, 10)
                        });
                        break;
                    case 'editArea':
                        await updateDoc(doc(db, "work_areas", item.id), { 
                            name: formData.name, 
                            latitude: parseFloat(formData.latitude), 
                            longitude: parseFloat(formData.longitude), 
                            radius: parseInt(formData.radius, 10),
                            pauseDuration: parseInt(formData.pauseDuration || 0, 10)
                        });
                        break;
                    case 'deleteArea':
                        const batchDeleteArea = writeBatch(db);
                        const employeesToUpdate = allEmployees.filter(emp => emp.workAreaIds?.includes(item.id));
                        employeesToUpdate.forEach(emp => {
                            const empRef = doc(db, "employees", emp.id);
                            const updatedAreaIds = emp.workAreaIds.filter(id => id !== item.id);
                            const updatedAreaNames = emp.workAreaNames.filter(name => name !== item.name);
                            batchDeleteArea.update(empRef, { workAreaIds: updatedAreaIds, workAreaNames: updatedAreaNames });
                        });
                        await batchDeleteArea.commit();
                        await deleteDoc(doc(db, "work_areas", item.id));
                        break;
                    case 'assignArea':
                        const selectedAreaNames = workAreas.filter(area => formData.workAreaIds?.includes(area.id)).map(area => area.name);
                        await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.workAreaIds || [], workAreaNames: selectedAreaNames });
                        break;
                    case 'deleteAdmin':
                        if (item.email === superAdminEmail) { throw new Error("Non puoi eliminare il Super Admin."); }
                        await deleteDoc(doc(db, "users", item.id));
                        break;
                    case 'assignManagedAreas':
                        const selectedManagedAreaNames = workAreas.filter(area => formData.managedAreaIds?.includes(area.id)).map(area => area.name);
                        await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.managedAreaIds || [], managedAreaNames: selectedManagedAreaNames });
                        break;
                    case 'manualClockIn':
                        await addDoc(collection(db, "time_entries"), { 
                            employeeId: item.id, 
                            workAreaId: formData.workAreaId, 
                            clockInTime: roundTimeWithCustomRules(new Date(formData.timestamp), 'entrata'), 
                            clockOutTime: null, 
                            status: 'clocked-in', 
                            note: formData.note || null, 
                            pauses: [] ,
                            createdBy: user.uid 
                        });
                        break;
                    case 'manualClockOut':
                        await updateDoc(doc(db, "time_entries", item.activeEntry.id), { 
                            clockOutTime: roundTimeWithCustomRules(new Date(formData.timestamp), 'uscita'), 
                            status: 'clocked-out', 
                            note: formData.note || item.activeEntry.note || null 
                        });
                        break;
                    case 'resetDevice':
                        await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                        break;
                    default: break;
                }
            }

            await onDataUpdate();
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
        assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
        newAdmin: 'Aggiungi Personale Amministrativo',
        deleteAdmin: 'Elimina Personale Amministrativo',
        assignManagedAreas: `Assegna Aree a Preposto ${item?.name}`,
        manualClockIn: `Timbra Entrata per ${item?.name} ${item?.surname}`,
        manualClockOut: `Timbra Uscita per ${item?.name} ${item?.surname}`,
        resetDevice: `Resetta Dispositivi di ${item?.name} ${item?.surname}`,
        adminClockIn: `Timbra Entrata Personale`,
        assignEmployeeToArea: 'Assegna Dipendente ad Aree'
    };

    // =================================================================================
    // FUNZIONE RENDERFORM COMPLETAMENTE AGGIORNATA
    // =================================================================================
    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'newAdmin':
                return ( <div className="space-y-4">
                    <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                    <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                    <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                    {type === 'newEmployee' && <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono (opzionale)" className="w-full p-2 border rounded" />}
                    {type === 'newAdmin' && currentUserRole === 'admin' && (
                        <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                            <option value="preposto">Preposto</option>
                            <option value="admin">Admin</option>
                        </select>
                    )}
                </div> );
            case 'editEmployee':
                return ( <div className="space-y-4">
                    <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                    <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                    <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono" className="w-full p-2 border rounded" />
                </div> );
            case 'newArea':
            case 'editArea':
                return ( <div className="space-y-4">
                    <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome Area" required className="w-full p-2 border rounded" />
                    <input type="number" step="any" name="latitude" value={formData.latitude || ''} onChange={handleInputChange} placeholder="Latitudine" required className="w-full p-2 border rounded" />
                    <input type="number" step="any" name="longitude" value={formData.longitude || ''} onChange={handleInputChange} placeholder="Longitudine" required className="w-full p-2 border rounded" />
                    <input type="number" name="radius" value={formData.radius || ''} onChange={handleInputChange} placeholder="Raggio (metri)" required className="w-full p-2 border rounded" />
                    <div>
                        <label htmlFor="pauseDuration" className="block text-sm font-medium text-gray-700">Durata Pausa</label>
                        <select 
                            name="pauseDuration" 
                            id="pauseDuration"
                            value={formData.pauseDuration || '0'} 
                            onChange={handleInputChange}
                            className="w-full p-2 border rounded bg-white"
                        >
                            <option value="0">0 Minuti (Disabilitata)</option>
                            <option value="30">30 Minuti</option>
                            <option value="60">60 Minuti</option>
                        </select>
                    </div>
                </div> );
            case 'assignArea':
                return ( <div className="space-y-2 max-h-60 overflow-y-auto">
                    {workAreas.map(area => (
                        <div key={area.id} className="flex items-center">
                            <input type="checkbox" id={area.id} name={area.id} checked={formData.workAreaIds?.includes(area.id) || false} onChange={handleCheckboxChange} className="h-4 w-4" />
                            <label htmlFor={area.id} className="ml-2">{area.name}</label>
                        </div>
                    ))}
                </div> );
            case 'assignEmployeeToArea':
                const prepostoAreas = workAreas.filter(area => userData.managedAreaIds.includes(area.id));
                return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700">Seleziona Dipendente</label>
                            <select name="employeeId" value={formData.employeeId || ''} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="">-- Scegli un dipendente --</option>
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Seleziona Aree da Assegnare</label>
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
            case 'assignManagedAreas':
                return ( <div className="space-y-2 max-h-60 overflow-y-auto">
                    {workAreas.map(area => (
                        <div key={area.id} className="flex items-center">
                            <input type="checkbox" id={area.id} name={area.id} checked={formData.managedAreaIds?.includes(area.id) || false} onChange={handleManagedAreasChange} className="h-4 w-4" />
                            <label htmlFor={area.id} className="ml-2">{area.name}</label>
                        </div>
                    ))}
                </div> );

            case 'manualClockIn':
                return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-1">Data e Ora di Entrata</label>
                            <input 
                                type="datetime-local" 
                                id="timestamp"
                                name="timestamp" 
                                value={formData.timestamp || ''} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full p-2 border rounded" 
                            />
                        </div>
                        <div>
                            <label htmlFor="workAreaId" className="block text-sm font-medium text-gray-700 mb-1">Area di Lavoro</label>
                            <select 
                                name="workAreaId" 
                                id="workAreaId"
                                value={formData.workAreaId || ''} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full p-2 border rounded"
                            >
                                <option value="">Seleziona Area</option>
                                {(item.workAreaIds || []).map(areaId => {
                                    const area = workAreas.find(a => a.id === areaId);
                                    return area ? <option key={area.id} value={area.id}>{area.name}</option> : null;
                                })}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                            <textarea 
                                name="note" 
                                id="note"
                                value={formData.note || ''} 
                                onChange={handleInputChange} 
                                placeholder="Aggiungi una nota..." 
                                className="w-full p-2 border rounded"
                            ></textarea>
                        </div>
                    </div>
                );

            case 'adminClockIn':
                return (
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-1">Data e Ora di Entrata</label>
                            <input 
                                type="datetime-local" 
                                id="timestamp"
                                name="timestamp" 
                                value={formData.timestamp || ''} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full p-2 border rounded" 
                            />
                        </div>
                        <div>
                            <label htmlFor="workAreaId" className="block text-sm font-medium text-gray-700 mb-1">Area di Lavoro</label>
                            <select 
                                name="workAreaId" 
                                id="workAreaId"
                                value={formData.workAreaId || ''} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full p-2 border rounded"
                            >
                                <option value="">Seleziona Area</option>
                                {(item.workAreaIds || []).map(areaId => {
                                    const area = workAreas.find(a => a.id === areaId);
                                    return area ? <option key={area.id} value={area.id}>{area.name}</option> : null;
                                })}
                            </select>
                        </div>
                    </div>
                );

            case 'manualClockOut':
                 return (
                     <div className="space-y-4">
                        <div>
                            <label htmlFor="timestamp" className="block text-sm font-medium text-gray-700 mb-1">Data e Ora di Uscita</label>
                            <input 
                               type="datetime-local" 
                               id="timestamp"
                               name="timestamp" 
                               value={formData.timestamp || ''} 
                               onChange={handleInputChange} 
                               required 
                               className="w-full p-2 border rounded" 
                            />
                        </div>
                        <div>
                            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
                            <textarea 
                               name="note" 
                               id="note"
                               value={formData.note || ''} 
                               onChange={handleInputChange} 
                               placeholder="Aggiungi o modifica una nota..." 
                               className="w-full p-2 border rounded"
                            ></textarea>
                        </div>
                     </div>
                 );
            
            case 'deleteEmployee': return <p>Sei sicuro di voler eliminare il dipendente <strong>{item.name} {item.surname}</strong>? L'azione è irreversibile.</p>;
            case 'deleteArea': return <p>Sei sicuro di voler eliminare l'area <strong>{item.name}</strong>? Verrà rimossa da tutti i dipendenti a cui è assegnata.</p>;
            case 'deleteAdmin': return <p>Sei sicuro di voler eliminare l'utente <strong>{item.name} {item.surname}</strong>?</p>;
            case 'resetDevice': return <p>Sei sicuro di voler resettare i dispositivi per <strong>{item.name} {item.surname}</strong>? Potrà registrare 2 nuovi dispositivi.</p>;
            default: return null;
        }
    };

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 m-4 max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">{titles[type]}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="text-2xl">&times;</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        {renderForm()}
                    </div>
                    {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                        <button type="submit" disabled={isLoading} className={`px-4 py-2 text-white rounded-md ${type.includes('delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-gray-400`}>
                            {isLoading ? 'Caricamento...' : (type.includes('delete') ? 'Elimina' : 'Conferma')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminModal;