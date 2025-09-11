// SOSTITUISCI IL TUO ATTUALE AdminModal CON QUESTO
const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees, currentUserRole }) => {
    const [formData, setFormData] = useState(item || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    // 'isSuperAdmin' è stata rimossa da qui

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
        if (type === 'manualClockIn' || type === 'manualClockOut') {
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
        if ((type === 'newEmployee' || type === 'newAdmin') && formData.password && formData.password.length < 6) { setError("La password deve essere di almeno 6 caratteri."); return; }
        if (type === 'deleteAdmin' && item.id === user.uid) { setError("Non puoi eliminare te stesso."); return; }

        setIsLoading(true);
        setError('');
        try {
            switch (type) {
                case 'newEmployee':
                    const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", userCred.user.uid), { email: formData.email, role: 'employee', name: formData.name, surname: formData.surname });
                    await addDoc(collection(db, "employees"), { userId: userCred.user.uid, name: formData.name, surname: formData.surname, phone: formData.phone, email: formData.email, workAreaIds: [], workAreaNames: [], deviceIds: [] });
                    break;
                case 'editEmployee':
                    await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                    break;
                case 'deleteEmployee':
                    await deleteDoc(doc(db, "employees", item.id));
                    break;
                case 'newArea':
                    await addDoc(collection(db, "work_areas"), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                    break;
                case 'editArea':
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
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
                case 'newAdmin':
                    const adminCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", adminCred.user.uid), { name: formData.name, surname: formData.surname, email: formData.email, role: formData.role || 'preposto', managedAreaIds: (formData.role || 'preposto') === 'preposto' ? [] : null, managedAreaNames: (formData.role || 'preposto') === 'preposto' ? [] : null });
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
                    await addDoc(collection(db, "time_entries"), { employeeId: item.id, workAreaId: formData.workAreaId, clockInTime: new Date(formData.timestamp), clockOutTime: null, status: 'clocked-in', note: formData.note || null, pauses: [] });
                    break;
                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), { clockOutTime: new Date(formData.timestamp), status: 'clocked-out', note: formData.note || item.activeEntry.note || null });
                    break;
                case 'resetDevice':
                    await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                    break;
                default: break;
            }
            await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error(err);
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
    };

    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'editEmployee':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                        <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                        <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono" className="w-full p-2 border rounded" />
                        {type === 'newEmployee' && (
                            <>
                                <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                                <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                            </>
                        )}
                    </div>
                );
            case 'newArea':
            case 'editArea':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome Area" required className="w-full p-2 border rounded" />
                        <input type="number" step="any" name="latitude" value={formData.latitude || ''} onChange={handleInputChange} placeholder="Latitudine" required className="w-full p-2 border rounded" />
                        <input type="number" step="any" name="longitude" value={formData.longitude || ''} onChange={handleInputChange} placeholder="Longitudine" required className="w-full p-2 border rounded" />
                        <input type="number" name="radius" value={formData.radius || ''} onChange={handleInputChange} placeholder="Raggio (metri)" required className="w-full p-2 border rounded" />
                    </div>
                );
            case 'assignArea':
                return (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {workAreas.map(area => (
                            <div key={area.id} className="flex items-center">
                                <input type="checkbox" id={area.id} name={area.id} checked={formData.workAreaIds?.includes(area.id) || false} onChange={handleCheckboxChange} className="h-4 w-4" />
                                <label htmlFor={area.id} className="ml-2">{area.name}</label>
                            </div>
                        ))}
                    </div>
                );
            case 'assignManagedAreas':
                return (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {workAreas.map(area => (
                            <div key={area.id} className="flex items-center">
                                <input type="checkbox" id={area.id} name={area.id} checked={formData.managedAreaIds?.includes(area.id) || false} onChange={handleManagedAreasChange} className="h-4 w-4" />
                                <label htmlFor={area.id} className="ml-2">{area.name}</label>
                            </div>
                        ))}
                    </div>
                );
            case 'manualClockIn':
            case 'manualClockOut':
                return (
                    <div className="space-y-4">
                        <input type="datetime-local" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        {type === 'manualClockIn' && (
                            <select name="workAreaId" value={formData.workAreaId || ''} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="">Seleziona Area</option>
                                {item.workAreaIds.map(areaId => {
                                    const area = workAreas.find(a => a.id === areaId);
                                    return area ? <option key={area.id} value={area.id}>{area.name}</option> : null;
                                })}
                            </select>
                        )}
                        <textarea name="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Note (opzionale)" className="w-full p-2 border rounded"></textarea>
                    </div>
                );
            case 'newAdmin':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                        <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                        <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                        <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                        {currentUserRole === 'admin' && (
                            <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="preposto">Preposto</option>
                                <option value="admin">Admin</option>
                            </select>
                        )}
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