// File: functions/src/index.js (CON CONTROLLO DEVICE ID - MAX 2 - E BLOCCO GEOGRAFICO USCITA)

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp, GeoPoint, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// --- Funzione Helper Arrotondamento Server-side ---
function roundTimeWithCustomRulesServer(date, type) {
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
    newDate.setSeconds(0); newDate.setMilliseconds(0);
    return newDate;
};

// ===============================================
// --- Funzione Creazione Utente (con flag mustChangePassword) ---
// ===============================================
exports.createUser = functions.region('europe-west1').https.onCall(async (data, context) => {
    // Controllo ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare nuovi utenti.');
    }
    // Validazione input base
    const { email, password, name, surname, role } = data;
    if (!email || !password || !name || !surname || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Email, password, nome, cognome e ruolo sono obbligatori.');
    }
    if (!['dipendente', 'preposto', 'admin'].includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', `Ruolo "${role}" non valido.`);
    }

    try {
        // Crea utente in Firebase Auth
        const userRecord = await admin.auth().createUser({ email, password, displayName: `${name} ${surname}` });
        console.log(`Utente Auth creato: ${userRecord.uid}`);
        // Imposta Custom Claim per il ruolo
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        console.log(`Custom Claim '${role}' impostato per ${userRecord.uid}`);

        // Crea documento in Firestore 'users' con flag cambio password
        const userDocRef = db.collection('users').doc(userRecord.uid);
        await userDocRef.set({
            name, surname, email, role,
            phone: data.phone || null,
            createdAt: FieldValue.serverTimestamp(),
            mustChangePassword: true // <-- Flag per forzare cambio PW
        });
        console.log(`Documento 'users/${userRecord.uid}' creato.`);

        // Se è dipendente o preposto, crea anche documento in 'employees'
        if (role === 'dipendente' || role === 'preposto') {
            const employeeData = {
                userId: userRecord.uid, name, surname, email,
                workAreaIds: [], deviceIds: [], // deviceIds inizializzato
                createdAt: FieldValue.serverTimestamp()
            };
            const employeeDocRef = await db.collection('employees').add(employeeData);
            console.log(`Documento 'employees/${employeeDocRef.id}' creato per ${userRecord.uid}`);
        }
        return { success: true, message: `Utente ${email} (${role}) creato con successo.` };
    } catch (error) {
        console.error("Errore durante la creazione dell'utente:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Questa email è già registrata.');
        }
        throw new functions.https.HttpsError('internal', `Errore del server: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Eliminazione Utente e Dipendente ---
// ===============================================
exports.deleteUserAndEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può eliminare utenti.');
    }
    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'L\'UID dell\'utente da eliminare è obbligatorio.');
    }

    try {
        // Elimina utente da Auth
        await admin.auth().deleteUser(userId);
        console.log(`Utente Auth ${userId} eliminato.`);
        // Elimina documento da 'users'
        await db.collection('users').doc(userId).delete();
        console.log(`Documento users/${userId} eliminato.`);
        // Trova ed elimina documento corrispondente in 'employees' (se esiste)
        const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
        if (!employeeQuery.empty) {
            const employeeDocId = employeeQuery.docs[0].id;
            await employeeQuery.docs[0].ref.delete();
            console.log(`Documento employees/${employeeDocId} eliminato.`);
        } else {
             console.log(`Nessun documento employees trovato per userId ${userId}.`);
        }
        return { success: true, message: `Utente ${userId} e dati associati eliminati.` };
    } catch (error) {
        console.error(`Errore eliminazione utente ${userId}:`, error);
        if (error.code === 'auth/user-not-found') {
             // Se l'utente Auth non esiste più ma i dati sì, prova a pulire comunque Firestore
             try {
                await db.collection('users').doc(userId).delete();
                const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
                if (!employeeQuery.empty) await employeeQuery.docs[0].ref.delete();
                console.warn(`Utente Auth ${userId} non trovato, ma dati Firestore eliminati (se presenti).`);
                return { success: true, message: `Dati Firestore per utente ${userId} eliminati (utente Auth non trovato).` };
             } catch (cleanupError) {
                 console.error(`Errore durante pulizia dati Firestore per utente ${userId} non trovato:`, cleanupError);
                 throw new functions.https.HttpsError('internal', `Utente Auth non trovato e errore durante pulizia dati Firestore: ${cleanupError.message}`);
             }
        }
        throw new functions.https.HttpsError('internal', `Errore server durante eliminazione: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Creazione Area di Lavoro ---
// ===============================================
exports.createWorkArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    // Controllo ruolo Admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare aree.');
    }
    // Validazione input
    const { name, latitude, longitude, radius, pauseDuration } = data;
    if (!name || latitude == null || longitude == null || radius == null) { // Controlla anche null/undefined
        throw new functions.https.HttpsError('invalid-argument', 'Nome, Latitudine, Longitudine e Raggio sono obbligatori.');
    }
    // Conversione e validazione numeri
    const lat = Number(latitude);
    const lon = Number(longitude);
    const rad = Number(radius);
    const pause = Number(pauseDuration || 0); // Default a 0 se non fornito

    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0 || isNaN(pause) || pause < 0) {
       throw new functions.https.HttpsError('invalid-argument', 'Latitudine, Longitudine devono essere numeri validi. Raggio > 0. Pausa >= 0.');
    }

    try {
        // Crea GeoPoint
        const location = new GeoPoint(lat, lon);
        // Aggiunge il documento alla collezione 'work_areas'
        const areaDocRef = await db.collection("work_areas").add({
            name,
            pauseDuration: pause,
            location, // Oggetto GeoPoint per query geospaziali
            latitude: lat, // Latitudine come numero
            longitude: lon, // Longitudine come numero
            radius: rad, // Raggio come numero
            createdAt: FieldValue.serverTimestamp() // Timestamp creazione
        });
        // Ritorna successo con l'ID della nuova area
        return { success: true, message: `Area "${name}" creata.`, areaId: areaDocRef.id };
    } catch (error) {
        console.error("Errore durante la creazione dell'area in Firestore:", error);
        throw new functions.https.HttpsError('internal', `Errore server durante la creazione dell'area: ${error.message}`);
    }
});

// ===============================================
// --- Funzioni Timbratura Manuale (Admin/Preposto) ---
// ===============================================
exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    // Verifica che chi chiama sia admin o preposto
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    // Validazione input
    const { employeeId, workAreaId, timestamp, adminId, note } = data; 
    if (!employeeId || !workAreaId || !timestamp || !adminId || !note) { 
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti (employeeId, workAreaId, timestamp, adminId, note).');
    }

    // === CORREZIONE ORA: Interpreta il timestamp (formato ISO dal client) in data corretta ===
    let clockInDate;
    try {
        const timestampWithZ = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
        clockInDate = new Date(timestampWithZ); 
        if (isNaN(clockInDate.getTime())) { 
           throw new Error('Data non valida.');
        }
    } catch (dateError) {
        console.error("Errore conversione data/ora:", dateError);
        throw new functions.https.HttpsError('invalid-argument', `Timestamp non valido: ${dateError.message}`);
    }
    // ===================================================================================================

    try {
        // Controlla se il dipendente ha già una timbratura attiva
        const activeEntryQuery = await db.collection('time_entries')
            .where('employeeId', '==', employeeId)
            .where('status', '==', 'clocked-in')
            .limit(1).get();
        if (!activeEntryQuery.empty) {
            const activeEntryTime = activeEntryQuery.docs[0].data().clockInTime.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
            throw new functions.https.HttpsError('failed-precondition', `Il dipendente ha già una timbratura attiva dal ${activeEntryTime}.`);
        }

        // Arrotonda l'orario (usando la data corretta) e crea la nuova timbratura
        const roundedClockInTime = roundTimeWithCustomRulesServer(clockInDate, 'entrata');
        await db.collection('time_entries').add({
            employeeId,
            workAreaId,
            clockInTime: Timestamp.fromDate(roundedClockInTime),
            clockOutTime: null,
            status: 'clocked-in',
            createdBy: adminId, 
            userId: employeeId, // AGGIUNTA TEMPORANEA PER REGOLE DI SICUREZZA
            pauses: [],
            isManual: true, 
            note: note, // Aggiunto Motivo
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true, message: "Timbratura di entrata manuale registrata." };
    } catch (error) {
        console.error("Errore manualClockIn:", error);
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    // Verifica che chi chiama sia admin o preposto
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    // Validazione input
    const { employeeId, timestamp, adminId, note } = data; 
    if (!employeeId || !timestamp || !adminId || !note) { 
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti (employeeId, timestamp, adminId, note).');
    }

    // === CORREZIONE ORA: Interpreta il timestamp (formato ISO dal client) in data corretta ===
    let clockOutDate;
    try {
        const timestampWithZ = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
        clockOutDate = new Date(timestampWithZ);
        if (isNaN(clockOutDate.getTime())) {
          throw new Error('Data non valida.');
        }
    } catch (dateError) {
        console.error("Errore conversione data/ora:", dateError);
        throw new functions.https.HttpsError('invalid-argument', `Timestamp non valido: ${dateError.message}`);
    }
    // ======================================================================================================

    try {
        // Trova la timbratura attiva del dipendente
        const q = db.collection('time_entries')
            .where('employeeId', '==', employeeId)
            .where('status', '==', 'clocked-in')
            .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata per questo dipendente.');
        }
        const entryDoc = snapshot.docs[0];
        const entryData = entryDoc.data();

        // Controlla che l'uscita sia dopo l'entrata
        if (entryData.clockInTime.toDate() >= clockOutDate) {
            const clockOutLocal = clockOutDate.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
            const clockInLocal = entryData.clockInTime.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
            throw new functions.https.HttpsError('invalid-argument', `L'orario di uscita (${clockOutLocal}) deve essere successivo all'entrata (${clockInLocal}).`);
        }
        // Controlla se il dipendente è in pausa
        const isInPause = (entryData.pauses || []).some(p => p.start && !p.end);
        if (isInPause) {
            throw new functions.https.HttpsError('failed-precondition', 'Il dipendente è attualmente in pausa. Terminare la pausa prima di timbrare l\'uscita.');
        }

        // Arrotonda l'orario (usando data corretta) e aggiorna la timbratura
        const roundedClockOutTime = roundTimeWithCustomRulesServer(clockOutDate, 'uscita');
        await entryDoc.ref.update({
            clockOutTime: Timestamp.fromDate(roundedClockOutTime),
            status: 'clocked-out',
            lastModifiedBy: adminId, 
            isManualExit: true, 
            note: note, // Aggiunto Motivo
            lastModifiedAt: FieldValue.serverTimestamp()
        });
        return { success: true, message: "Timbratura di uscita manuale registrata." };
    } catch (error) {
        console.error("Errore manualClockOut:", error);
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});


// ===============================================
// --- Funzioni Pausa (Preposto per Sé) ---
// ===============================================
exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    // Solo Preposto
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata ai preposti.');
    }
    // AGGIUNTO: Validazione deviceId
    const { deviceId } = data;
    if (!deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'ID Dispositivo mancante.');
    }

    try {
        // Trova profilo employee del preposto
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente del preposto non trovato.');
        }
        const employeeDoc = employeeQuery.docs[0];
        const employeeId = employeeDoc.id;
        
        // CONTROLLO DEVICE ID - BYPASS PER AZIONI WEB (Admin/Preposto)
        const currentDeviceIds = employeeDoc.data().deviceIds || [];
        const isWebBypass = (deviceId === 'ADMIN_MANUAL_ACTION' || deviceId === 'PREPOSTO_MANUAL_ACTION');

        if (!isWebBypass && !currentDeviceIds.includes(deviceId)) {
            throw new functions.https.HttpsError('permission-denied', 'Dispositivo non autorizzato per questa azione.');
        }

        // Trova timbratura attiva del preposto
        const q = db.collection('time_entries')
            .where('employeeId', '==', employeeId)
            .where('status', '==', 'clocked-in')
            .limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
        }
        const entryRef = snapshot.docs[0].ref;
        const currentPauses = snapshot.docs[0].data().pauses || [];
        const now = Timestamp.now();

        // Trova indice pausa attiva (se esiste)
        const activePauseIndex = currentPauses.findIndex(p => p.start && !p.end);

        if (activePauseIndex !== -1) { // Se in pausa -> termina
            currentPauses[activePauseIndex].end = now;
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa terminata.` };
        } else { // Se non in pausa -> inizia (pausa manuale, non automatica)
            currentPauses.push({ start: now, end: null, createdBy: uid, isAutomatic: false });
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa iniziata.` };
        }
    } catch (error) {
        console.error("Errore prepostoTogglePause:", error);
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

// ===============================================
// --- Funzione Assegnazione Aree (Preposto per Dipendente) ---
// ===============================================
exports.prepostoAssignEmployeeToArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    // Solo Preposto
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata ai preposti.');
    }
    // Validazione input
    const { employeeId, areaIds } = data; // employeeId = ID documento employee; areaIds = array ID aree selezionate dal preposto
    if (!employeeId || !Array.isArray(areaIds)) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti o non validi (employeeId, areaIds).');
    }

    try {
        // Leggi le aree gestite dal preposto
        const prepostoUserDoc = await db.collection('users').doc(uid).get();
        if (!prepostoUserDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Profilo utente del preposto non trovato.');
        }
        const managedAreaIds = prepostoUserDoc.data().managedAreaIds || [];
        if (managedAreaIds.length === 0) {
            throw new functions.https.HttpsError('permission-denied', 'Non risulti gestire alcuna area. Contatta un amministratore.');
        }

        // Verifica che tutte le aree selezionate siano tra quelle gestite
        const isAllowed = areaIds.every(id => managedAreaIds.includes(id));
        if (!isAllowed) {
            throw new functions.https.HttpsError('permission-denied', 'Stai cercando di assegnare aree che non gestisci.');
        }

        // Leggi il documento del dipendente
        const employeeRef = db.collection('employees').doc(employeeId);
        const employeeDoc = await employeeRef.get();
        if (!employeeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Dipendente selezionato non trovato.');
        }
        const currentWorkAreaIds = employeeDoc.data().workAreaIds || [];

        // Filtra le aree attuali del dipendente, mantenendo solo quelle NON gestite da questo preposto
        const otherAreaIds = currentWorkAreaIds.filter(id => !managedAreaIds.includes(id));

        // Unisci le aree non gestite dal preposto con quelle NUOVE selezionate dal preposto, eliminando duplicati
        const finalAreaIds = [...new Set([...otherAreaIds, ...areaIds])];

        // Aggiorna il documento del dipendente
        await employeeRef.update({
            workAreaIds: finalAreaIds,
            lastModifiedBy: uid, 
            lastModifiedAt: FieldValue.serverTimestamp()
        });

        return { success: true, message: `Aree di competenza aggiornate per il dipendente.` };
    } catch (error) {
        console.error("Errore prepostoAssignEmployeeToArea:", error);
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});


// ===============================================
// --- Funzione Patch Admin (Disattivata da Frontend) ---
// ===============================================
exports.TEMP_fixMyClaim = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) { throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.'); }
    const email = context.auth.token.email;
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; // Considera di metterla in config
    if (email !== superAdminEmail) {
        throw new functions.https.HttpsError('permission-denied', `Azione permessa solo a ${superAdminEmail}.`);
    }
    try {
        await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ role: 'admin' });
        console.log(`Ruolo 'admin' impostato per ${uid} tramite TEMP_fixMyClaim.`);
        return { success: true, message: `Ruolo 'admin' impostato.` };
    } catch (error) {
        console.error("Errore TEMP_fixMyClaim:", error);
        throw new functions.https.HttpsError('internal', `Errore server durante patch: ${error.message}`);
    }
});


// ===============================================
// --- NUOVA FUNZIONE: Applica Pausa Automatica (Dipendente/Preposto) ---
// ===============================================
exports.applyAutoPauseEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role; 

    // Permetti solo a dipendenti e preposti loggati
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }

    const { durationMinutes, deviceId } = data; // Riceve la durata E deviceId dal frontend
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0 || !deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'Durata della pausa non valida o ID Dispositivo mancante.');
    }

    try {
        // Trova il profilo employee dell'utente che chiama
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeDoc = employeeQuery.docs[0];
        const employeeId = employeeDoc.id;
        
        // CONTROLLO DEVICE ID - BYPASS PER AZIONI WEB (Admin/Preposto)
        const currentDeviceIds = employeeDoc.data().deviceIds || [];
        const isWebBypass = (deviceId === 'ADMIN_MANUAL_ACTION' || deviceId === 'PREPOSTO_MANUAL_ACTION') && (callerRole === 'admin' || callerRole === 'preposto');

        if (!isWebBypass && !currentDeviceIds.includes(deviceId)) {
            throw new functions.https.HttpsError('permission-denied', 'Dispositivo non autorizzato per questa azione.');
        }

        // Trova la timbratura attiva per questo dipendente
        const q = db.collection('time_entries')
                    .where('employeeId', '==', employeeId)
                    .where('status', '==', 'clocked-in')
                    .limit(1);
        const snapshot = await q.get();

        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata per applicare la pausa.');
        }
        const entryRef = snapshot.docs[0].ref;
        const entryData = snapshot.docs[0].data();
        const currentPauses = entryData.pauses || [];

        // Controlla se è già in pausa
        const isAlreadyInPause = currentPauses.some(p => p.start && !p.end);
        if (isAlreadyInPause) {
             throw new functions.https.HttpsError('failed-precondition', 'Sei già in pausa.');
        }
        
        // Controlla se la pausa è stata già completata (logica del frontend, ma utile come ulteriore controllo)
        const hasCompletedPause = currentPauses.some(p => p.start && p.end && p.isAutomatic);
        if (hasCompletedPause) {
             throw new functions.https.HttpsError('failed-precondition', 'La pausa automatica è stata già completata per questo turno.');
        }

        // Calcola inizio e fine della pausa automatica
        const startTime = new Date(); // Ora attuale
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000); // Aggiunge durata

        const newPause = {
            start: Timestamp.fromDate(startTime),
            end: Timestamp.fromDate(endTime), // Imposta subito anche la fine
            durationMinutes: durationMinutes,
            createdBy: uid, // Registra chi ha avviato la pausa
            isAutomatic: true // Flag per indicare che è automatica
        };

        // Aggiunge la nuova pausa all'array esistente usando arrayUnion
        await entryRef.update({
            pauses: FieldValue.arrayUnion(newPause)
        });

        return { success: true, message: `Pausa automatica di ${durationMinutes} minuti applicata.` };

    } catch (error) {
        console.error("Errore applyAutoPauseEmployee:", error);
        // Rilancia errori HttpsError, altrimenti errore interno generico
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});


// ===============================================
// --- NUOVA FUNZIONE: Termina Pausa Dipendente/Preposto ---
// ===============================================
exports.endEmployeePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;

    // Permetti solo a dipendenti e preposti loggati
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    
    // AGGIUNTO: Validazione deviceId
    const { deviceId } = data;
    if (!deviceId) {
        throw new functions.https.HttpsError('invalid-argument', 'ID Dispositivo mancante.');
    }

    try {
        // Trova il profilo employee dell'utente che chiama
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeDoc = employeeQuery.docs[0];
        const employeeId = employeeDoc.id;
        
        // CONTROLLO DEVICE ID - BYPASS PER AZIONI WEB (Admin/Preposto)
        const currentDeviceIds = employeeDoc.data().deviceIds || [];
        const isWebBypass = (deviceId === 'ADMIN_MANUAL_ACTION' || deviceId === 'PREPOSTO_MANUAL_ACTION') && (callerRole === 'admin' || callerRole === 'preposto');

        if (!isWebBypass && !currentDeviceIds.includes(deviceId)) {
            throw new functions.https.HttpsError('permission-denied', 'Dispositivo non autorizzato per questa azione.');
        }

        // Trova la timbratura attiva
        const q = db.collection('time_entries')
                    .where('employeeId', '==', employeeId)
                    .where('status', '==', 'clocked-in')
                    .limit(1);
        const snapshot = await q.get();

        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
        }
        const entryRef = snapshot.docs[0].ref;
        const entryData = snapshot.docs[0].data();
        const currentPauses = entryData.pauses || [];

        // Trova l'indice della pausa attiva (quella senza 'end')
        const activePauseIndex = currentPauses.findIndex(p => p.start && !p.end);

        if (activePauseIndex === -1) {
            throw new functions.https.HttpsError('failed-precondition', 'Nessuna pausa attiva da terminare.');
        }

        // Imposta l'orario di fine della pausa attiva all'ora attuale
        currentPauses[activePauseIndex].end = Timestamp.now();

        // Aggiorna l'array pauses nel documento
        await entryRef.update({ pauses: currentPauses });

        return { success: true, message: `Pausa terminata.` };

    } catch (error) {
        console.error("Errore endEmployeePause:", error);
        if (error.code && error.code.startsWith('functions')) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

// ===============================================
// --- Funzioni Timbratura Dipendente (usate da EmployeeDashboard) ---
// ===============================================
exports.clockEmployeeIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) { 
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    const { areaId, deviceId, isGpsRequired, currentLat, currentLon, note } = data; // Destrutturazione completa
    if (!areaId || !deviceId) { // deviceId ora obbligatorio per la timbratura
        throw new functions.https.HttpsError('invalid-argument', 'ID Area e ID Dispositivo sono mancanti.');
    }
    const finalDeviceId = deviceId; // Usiamo deviceId inviato dal client (localStorage)
    const MAX_DEVICES = 2; // Limite massimo di dispositivi
    

    try {
        // Trova profilo employee
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeDoc = employeeQuery.docs[0];
        const employeeId = employeeDoc.id;
        const employeeRef = employeeDoc.ref;

        // ====================================================
        // --- LOGICA REGISTRAZIONE / VALIDAZIONE DISPOSITIVO ---
        // ====================================================
        const currentDeviceIds = employeeDoc.data().deviceIds || [];
        const isDeviceRegistered = currentDeviceIds.includes(finalDeviceId);
        
        if (!isDeviceRegistered) {
            if (currentDeviceIds.length >= MAX_DEVICES) {
                // BLOCCO 1: Limite raggiunto e dispositivo NON autorizzato
                throw new functions.https.HttpsError('permission-denied', `Timbratura bloccata. Raggiunto il limite massimo di ${MAX_DEVICES} dispositivi registrati. Contatta l'amministratore per il reset.`);
            } else {
                // BLOCCO 2: Registrazione del nuovo dispositivo (slot disponibile)
                await employeeRef.update({
                    deviceIds: FieldValue.arrayUnion(finalDeviceId)
                });
                console.log(`[Device Registration] Nuovo device ID (${finalDeviceId}) registrato per ${employeeId}. Slot usato: ${currentDeviceIds.length + 1}/${MAX_DEVICES}.`);
            }
        }
        // ====================================================

         // Controlla timbratura attiva
         const activeEntryQuery = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1).get();
         if (!activeEntryQuery.empty) {
             const activeEntryTime = activeEntryQuery.docs[0].data().clockInTime.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
             throw new functions.https.HttpsError('failed-precondition', `Timbratura già attiva dal ${activeEntryTime}.`);
         }

         // Arrotonda e crea timbratura
         const now = new Date();
         const roundedClockInTime = roundTimeWithCustomRulesServer(now, 'entrata');
         await db.collection('time_entries').add({
             employeeId,
             workAreaId: areaId,
             clockInTime: Timestamp.fromDate(roundedClockInTime),
             clockOutTime: null,
             status: 'clocked-in',
             createdBy: uid, 
             pauses: [],
             // Aggiunti campi per tracciamento GPS (se forniti) e nota:
             gpsTracked: isGpsRequired === true, // Traccia se era obbligatorio
             clockInLat: currentLat || null,
             clockInLon: currentLon || null,
             note: note || '',
             createdAt: FieldValue.serverTimestamp() // Timestamp creazione documento
         });
         return { success: true, message: "Timbratura di entrata registrata." };
     } catch (error) {
         console.error("Errore clockEmployeeIn:", error);
         if (error.code && error.code.startsWith('functions')) throw error;
         throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
     }
});

// -----------------------------------------------------------------------------------
// 🆕 NUOVA FUNZIONE MODIFICATA PER BLOCCO USCITA GEOGRAFICO 🆕
// -----------------------------------------------------------------------------------
exports.clockEmployeeOut = functions.region('europe-west1').https.onCall(async (data, context) => {
     const uid = context.auth?.uid;
     const callerRole = context.auth?.token.role;
     if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
         throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
     }
       // AGGIUNTO: Validazione deviceId E areaId (Nuovo parametro richiesto)
       const { deviceId, areaId } = data;
       
       if (!deviceId) {
           throw new functions.https.HttpsError('invalid-argument', 'ID Dispositivo è mancante.');
       }

     try {
         // Trova profilo employee
         const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
         if (employeeQuery.empty) {
             throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
         }
           const employeeDoc = employeeQuery.docs[0];
         const employeeId = employeeDoc.id;
           
           // CONTROLLO DEVICE ID
           const currentDeviceIds = employeeDoc.data().deviceIds || [];
           if (!currentDeviceIds.includes(deviceId)) {
               throw new functions.https.HttpsError('permission-denied', 'Dispositivo non autorizzato per questa azione.');
           }

         // Trova timbratura attiva
         const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
         const snapshot = await q.get();
         if (snapshot.empty) {
             throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
         }
         const entryDoc = snapshot.docs[0];
         const entryData = entryDoc.data();

         // 🛑 NUOVO BLOCCO DI SICUREZZA: Verifica corrispondenza Area Entrata = Area Uscita 🛑
         if (areaId && entryData.workAreaId && entryData.workAreaId !== areaId) {
             // Opzionale: recupera il nome dell'area per un messaggio migliore, ma per ora blocca e basta.
             throw new functions.https.HttpsError('failed-precondition', 'Devi timbrare l\'uscita nella stessa area di lavoro in cui hai timbrato l\'entrata.');
         }

         // Controlla se in pausa
         const isInPause = (entryData.pauses || []).some(p => p.start && !p.end);
         if (isInPause) {
             throw new functions.https.HttpsError('failed-precondition', 'Terminare la pausa prima di timbrare l\'uscita.');
         }

         // Arrotonda e aggiorna timbratura
         const now = new Date();
         // Verifica che l'uscita sia dopo l'entrata
         if (entryData.clockInTime.toDate() >= now) {
             const nowLocal = now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
             const clockInLocal = entryData.clockInTime.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
             throw new functions.https.HttpsError('invalid-argument', `L'orario di uscita (${nowLocal}) non può essere uguale o precedente all'entrata (${clockInLocal}).`);
         }
         const roundedClockOutTime = roundTimeWithCustomRulesServer(now, 'uscita');
         await entryDoc.ref.update({
             clockOutTime: Timestamp.fromDate(roundedClockOutTime),
             status: 'clocked-out',
             lastModifiedBy: uid, 
             lastModifiedAt: FieldValue.serverTimestamp() 
         });
         return { success: true, message: "Timbratura di uscita registrata." };
     } catch (error) {
         console.error("Errore clockEmployeeOut:", error);
         if (error.code && error.code.startsWith('functions')) throw error;
         throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
     }
});

// ===============================================
// --- NUOVA FUNZIONE: Genera Report (Admin/Preposto) ---
// ===============================================
exports.generateTimeReport = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;

    // 1. Controllo Autorizzazione di base (Admin o Preposto)
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Solo Amministratori o Preposti possono generare report.');
    }

    // 2. Validazione Input
    const { startDate: startISO, endDate: endISO, employeeIdFilter, areaIdFilter } = data;
    if (!startISO || !endISO) {
        throw new functions.https.HttpsError('invalid-argument', 'Date di inizio e fine sono obbligatorie.');
    }

    const startDate = new Date(startISO); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endISO); endDate.setHours(23, 59, 59, 999);
    
    // Controlla che le date siano valide
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'Formato data non valido.');
    }

    try {
        // 3. Query Iniziale
        let q = db.collection('time_entries')
            .where('clockInTime', '>=', Timestamp.fromDate(startDate))
            .where('clockInTime', '<=', Timestamp.fromDate(endDate));

        // 4. Applicazione Filtri Globali (se forniti dal frontend)
        if (employeeIdFilter && employeeIdFilter !== 'all') {
            q = q.where('employeeId', '==', employeeIdFilter);
        }
        if (areaIdFilter && areaIdFilter !== 'all') {
            q = q.where('workAreaId', '==', areaIdFilter);
        }

        const querySnapshot = await q.get();
        let finalEntries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 5. Applicazione Filtro Preposto (lato server)
        if (callerRole === 'preposto') {
            // Recupera le aree gestite dal preposto
            const prepostoUserDoc = await db.collection('users').doc(callerUid).get();
            const managedAreaIds = prepostoUserDoc.data()?.managedAreaIds || [];

            if (managedAreaIds.length === 0) {
                return { reports: [], message: 'Nessuna area di competenza gestita. Report vuoto.' };
            }
            
            // Trova gli employeeId collegati a queste aree
            const employeesInManagedAreasSnap = await db.collection('employees')
                .where('workAreaIds', 'array-contains-any', managedAreaIds)
                .get();
            const trulyManagedEmployeeIds = employeesInManagedAreasSnap.docs.map(doc => doc.id);


            // Filtra le timbrature solo per i dipendenti di competenza
            finalEntries = finalEntries.filter(entry => trulyManagedEmployeeIds.includes(entry.employeeId));
        }

        // 6. Serializza i risultati (incluso il campo Timestamp) per la risposta
        const serializedReports = finalEntries.map(entry => ({
            ...entry,
            // Converte tutti i Timestamp in stringhe ISO per il trasferimento
            clockInTime: entry.clockInTime?.toDate()?.toISOString() || null,
            clockOutTime: entry.clockOutTime?.toDate()?.toISOString() || null,
            createdAt: entry.createdAt?.toDate()?.toISOString() || null,
            // Converte Timestamp delle pause
            pauses: (entry.pauses || []).map(p => ({
                ...p,
                start: p.start?.toDate()?.toISOString() || null,
                end: p.end?.toDate()?.toISOString() || null,
            })),
            // L'ID del documento è già incluso: entry.id
        }));

        return { 
            reports: serializedReports, 
            message: `Report generato con ${serializedReports.length} timbrature.` 
        };

    } catch (error) {
        console.error("Errore generateTimeReport:", error);
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});