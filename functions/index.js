const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp, GeoPoint, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// Funzione di arrotondamento (necessaria per le funzioni manualClockIn/Out)
function roundTimeWithCustomRulesServer(date, type) {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) {
            newDate.setHours(newDate.getHours() + 1); newDate.setMinutes(0);
        } else if (minutes >= 16) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
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

// ===============================================
// --- FUNZIONE DI CREAZIONE UTENTE (AGGIORNATA) ---
// ===============================================
exports.createUser = functions.region('europe-west1').https.onCall(async (data, context) => {
    // Controllo che chi chiama sia un admin
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare nuovi utenti.');
    }

    const { email, password, name, surname, role } = data;
    if (!email || !password || !name || !surname || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Email, password, nome, cognome e ruolo sono obbligatori.');
    }
    if (!['dipendente', 'preposto', 'admin'].includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', `Ruolo "${role}" non valido.`);
    }

    try {
        // PASSO 1: Crea l'utente in Firebase Authentication
        const userRecord = await admin.auth().createUser({ 
            email, 
            password, 
            displayName: `${name} ${surname}` 
        });
        console.log(`Utente Auth creato: ${userRecord.uid}`);

        // PASSO 2: Imposta il suo ruolo tramite Custom Claim
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        console.log(`Custom Claim '${role}' impostato per ${userRecord.uid}`);

        // PASSO 3: Crea il documento nella collezione 'users'
        const userDocRef = db.collection('users').doc(userRecord.uid);
        await userDocRef.set({ 
            name, 
            surname, 
            email, 
            role,
            phone: data.phone || null,
            createdAt: FieldValue.serverTimestamp(),
            mustChangePassword: true // <-- MODIFICA: Aggiunto flag per cambio password obbligatorio
        });
        console.log(`Documento 'users/${userRecord.uid}' creato con mustChangePassword=true.`);

        // PASSO 4: SE è un dipendente o preposto, crea il profilo in 'employees'
        if (role === 'dipendente' || role === 'preposto') {
            const employeeData = { 
                userId: userRecord.uid,
                name, 
                surname, 
                email, 
                workAreaIds: [],
                deviceIds: [],
                createdAt: FieldValue.serverTimestamp()
            };
            const employeeDocRef = await db.collection('employees').add(employeeData); 
            console.log(`Documento 'employees/${employeeDocRef.id}' creato per l'utente ${userRecord.uid}`);
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
// --- ALTRE FUNZIONI (invariate) ---
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
        await admin.auth().deleteUser(userId);
        await db.collection('users').doc(userId).delete();
        const employeeQuery = await db.collection('employees').where('userId', '==', userId).limit(1).get();
        if (!employeeQuery.empty) {
            await employeeQuery.docs[0].ref.delete();
        }
        return { success: true, message: `Utente ${userId} eliminato.` };
    } catch (error) {
        console.error(`Errore eliminazione utente ${userId}:`, error);
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError('not-found', 'Utente non trovato.');
        }
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.createWorkArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un amministratore può creare aree.');
    }
    const { name, latitude, longitude, radius, pauseDuration } = data;
    if (!name || latitude == null || longitude == null || radius == null) {
        throw new functions.https.HttpsError('invalid-argument', 'Nome, Lat, Lon e Raggio sono obbligatori.');
    }
    const lat = Number(latitude);
    const lon = Number(longitude);
    const rad = Number(radius);
    const pause = Number(pauseDuration || 0);

    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0 || isNaN(pause) || pause < 0) {
       throw new functions.https.HttpsError('invalid-argument', 'Dati numerici non validi.');
    }

    try {
        const location = new GeoPoint(lat, lon);
        const areaDocRef = await db.collection("work_areas").add({
            name,
            pauseDuration: pause,
            location,
            latitude: lat,
            longitude: lon,
            radius: rad,
            createdAt: FieldValue.serverTimestamp()
        });
        return { success: true, message: `Area "${name}" creata.`, areaId: areaDocRef.id };
    } catch (error) {
        console.error("Errore creazione area:", error);
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    const { employeeId, workAreaId, timestamp } = data;
    if (!employeeId || !workAreaId || !timestamp) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti.');
    }
    const clockInTime = new Date(timestamp);
    if (isNaN(clockInTime.getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'Timestamp non valido.');
    }
    try {
        const activeEntryQuery = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1).get();
        if (!activeEntryQuery.empty) {
            const activeEntryTime = activeEntryQuery.docs[0].data().clockInTime.toDate().toLocaleString('it-IT');
            throw new functions.https.HttpsError('failed-precondition', `Timbratura già attiva dal ${activeEntryTime}.`);
        }
        const roundedClockInTime = roundTimeWithCustomRulesServer(clockInTime, 'entrata');
        await db.collection('time_entries').add({
            employeeId,
            workAreaId,
            clockInTime: Timestamp.fromDate(roundedClockInTime),
            clockOutTime: null,
            status: 'clocked-in',
            createdBy: callerUid,
            pauses: [],
            isManual: true,
            createdAt: FieldValue.serverTimestamp()
        });
        return { success: true, message: "Timbratura di entrata registrata." };
    } catch (error) {
        if (error.code) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!callerUid || (callerRole !== 'admin' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
    const { employeeId, timestamp } = data;
    if (!employeeId || !timestamp) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti.');
    }
    const clockOutTime = new Date(timestamp);
    if (isNaN(clockOutTime.getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'Timestamp non valido.');
    }
    try {
        const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
        }
        const entryDoc = snapshot.docs[0];
        const entryData = entryDoc.data();
        if (entryData.clockInTime.toDate() >= clockOutTime) {
            throw new functions.https.HttpsError('invalid-argument', `L'uscita deve essere dopo l'entrata.`);
        }
        const activePause = (entryData.pauses || []).find(p => !p.end);
        if (activePause) {
            throw new functions.https.HttpsError('failed-precondition', 'Terminare la pausa prima di timbrare l\'uscita.');
        }
        const roundedClockOutTime = roundTimeWithCustomRulesServer(clockOutTime, 'uscita');
        await entryDoc.ref.update({
            clockOutTime: Timestamp.fromDate(roundedClockOutTime),
            status: 'clocked-out',
            lastModifiedBy: callerUid,
            isManualExit: true
        });
        return { success: true, message: "Timbratura di uscita registrata." };
    } catch (error) {
        if (error.code) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata ai preposti.');
    }
    try {
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente del preposto non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;
        const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
        }
        const entryRef = snapshot.docs[0].ref;
        const currentPauses = snapshot.docs[0].data().pauses || [];
        const now = Timestamp.now();
        const activePauseIndex = currentPauses.findIndex(p => p.start && !p.end);
        if (activePauseIndex !== -1) {
            currentPauses[activePauseIndex].end = now;
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa terminata.` };
        } else {
            currentPauses.push({ start: now, end: null });
            await entryRef.update({ pauses: currentPauses });
            return { success: true, message: `Pausa iniziata.` };
        }
    } catch (error) {
        if (error.code) throw error;
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.prepostoAssignEmployeeToArea = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Azione riservata ai preposti.');
    }
    const { employeeId, areaIds } = data;
    if (!employeeId || !Array.isArray(areaIds)) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti.');
    }
    try {
        const prepostoUserDoc = await db.collection('users').doc(uid).get();
        if (!prepostoUserDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Profilo preposto non trovato.');
        }
        const managedAreaIds = prepostoUserDoc.data().managedAreaIds || [];
        if (managedAreaIds.length === 0) {
            throw new functions.https.HttpsError('permission-denied', 'Non gestisci nessuna area.');
        }
        const isAllowed = areaIds.every(id => managedAreaIds.includes(id));
        if (!isAllowed) {
            throw new functions.https.HttpsError('permission-denied', 'Puoi assegnare solo aree che gestisci.');
        }
        const employeeRef = db.collection('employees').doc(employeeId);
        const employeeDoc = await employeeRef.get();
        if (!employeeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Dipendente non trovato.');
        }
        const currentWorkAreaIds = employeeDoc.data().workAreaIds || [];
        const otherAreaIds = currentWorkAreaIds.filter(id => !managedAreaIds.includes(id));
        const finalAreaIds = [...new Set([...otherAreaIds, ...areaIds])];
        await employeeRef.update({
            workAreaIds: finalAreaIds,
            lastModifiedBy: uid,
            lastModifiedAt: FieldValue.serverTimestamp()
        });
        return { success: true, message: `Aree aggiornate.` };
    } catch (error) {
        if (error.code) throw error;
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

exports.TEMP_fixMyClaim = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.');
    }
    const email = context.auth.token.email;
    const superAdminEmail = "domenico.leoncino@tcsitalia.com";
    if (email !== superAdminEmail) {
        throw new functions.https.HttpsError('permission-denied', `Azione permessa solo a ${superAdminEmail}.`);
    }
    try {
        await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
        const userDocRef = db.collection('users').doc(uid);
        await userDocRef.update({ role: 'admin' });
        return { success: true, message: `Ruolo 'admin' impostato.` };
    } catch (error) {
        throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
    }
});

