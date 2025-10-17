const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// --- FUNZIONI DI GESTIONE UTENTI (Solo Admin) ---

exports.createUser = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un admin può creare utenti.');
    }
    // ... (codice per creare utente, come prima)
    const { email, password, name, surname, role } = data;
    if (!email || !password || !name || !surname || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Tutti i campi sono obbligatori.');
    }
    try {
        const userRecord = await admin.auth().createUser({ email, password, displayName: `${name} ${surname}` });
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        await db.collection('users').doc(userRecord.uid).set({ name, surname, email, role });
        const employeeData = { userId: userRecord.uid, name, surname, email, workAreaIds: [], deviceIds: [] };
        // Un preposto è anche un "dipendente" ai fini della timbratura
        if (role === 'dipendente' || role === 'preposto') {
            await db.collection('employees').doc().set(employeeData);
        }
        return { result: `Utente ${email} creato.` };
    } catch (error) {
        console.error("Errore creazione utente:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.deleteUserAndEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (context.auth?.token.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Solo un admin può eliminare utenti.');
    }
    // ... (codice per eliminare utente, come prima)
    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'userId è obbligatorio.');
    }
    try {
        await admin.auth().deleteUser(userId);
        await db.collection('users').doc(userId).delete();
        const employeeQuery = await db.collection('employees').where('userId', '==', userId).get();
        if (!employeeQuery.empty) {
            await employeeQuery.docs[0].ref.delete();
        }
        return { result: `Utente ${userId} eliminato.` };
    } catch (error) {
        console.error("Errore eliminazione utente:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- FUNZIONI DI TIMBRATURA MANUALE DIPENDENTI (Admin/Preposto) ---

exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerRole = context.auth?.token.role;
    if (callerRole !== 'admin' && callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ad admin e preposti.');
    }
    // ... (codice per timbratura manuale entrata, come prima)
    const { employeeId, workAreaId, timestamp, adminId } = data;
    if (!employeeId || !workAreaId || !timestamp || !adminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti per la timbratura.');
    }
    try {
        await db.collection('time_entries').add({
            employeeId, workAreaId, clockInTime: Timestamp.fromDate(new Date(timestamp)),
            clockOutTime: null, status: 'clocked-in', createdBy: adminId, pauses: [],
        });
        return { result: "Timbratura di entrata manuale registrata." };
    } catch (error) {
        console.error("Errore timbratura manuale IN:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => {
    const callerRole = context.auth?.token.role;
    if (callerRole !== 'admin' && callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ad admin e preposti.');
    }
    // ... (codice per timbratura manuale uscita, come prima)
    const { employeeId, timestamp, adminId } = data;
    if (!employeeId || !timestamp || !adminId) {
        throw new functions.https.HttpsError('invalid-argument', 'Dati mancanti per la timbratura.');
    }
    try {
        const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Nessuna timbratura di entrata attiva trovata per questo dipendente.');
        }
        const entryDoc = snapshot.docs[0];
        await entryDoc.ref.update({ clockOutTime: Timestamp.fromDate(new Date(timestamp)), status: 'clocked-out', lastModifiedBy: adminId });
        return { result: "Timbratura di uscita manuale registrata." };
    } catch (error) {
        console.error("Errore timbratura manuale OUT:", error);
        if(error.code) throw error;
        throw new functions.https.HttpsError('internal', error.message);
    }
});


// --- NUOVE FUNZIONI DI TIMBRATURA PER IL PREPOSTO ---

/**
 * Permette a un preposto di timbrare la propria entrata.
 */
exports.prepostoClockIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ai preposti.');
    }
    
    const { workAreaId, timestamp } = data;
    if (!workAreaId || !timestamp) {
        throw new functions.https.HttpsError('invalid-argument', 'Area e orario sono obbligatori.');
    }

    try {
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente del preposto non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;

        await db.collection('time_entries').add({
            employeeId: employeeId,
            workAreaId,
            clockInTime: Timestamp.fromDate(new Date(timestamp)),
            clockOutTime: null,
            status: 'clocked-in',
            createdBy: uid,
            pauses: [],
        });
        return { result: "Timbratura entrata preposto registrata." };
    } catch (error) {
        console.error("Errore timbratura preposto IN:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});


/**
 * Gestisce l'inizio/fine della pausa per il preposto.
 */
exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || callerRole !== 'preposto') {
        throw new functions.https.HttpsError('permission-denied', 'Funzione riservata ai preposti.');
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
        const entryData = snapshot.docs[0].data();
        const currentPauses = entryData.pauses || [];
        const activePause = currentPauses.find(p => !p.end);

        if (activePause) { // Se c'è una pausa attiva, la termino
            const pauseIndex = currentPauses.findIndex(p => !p.end);
            currentPauses[pauseIndex].end = Timestamp.now();
        } else { // Altrimenti, ne inizio una nuova
            currentPauses.push({ start: Timestamp.now(), end: null });
        }

        await entryRef.update({ pauses: currentPauses });
        return { result: `Pausa ${activePause ? 'terminata' : 'iniziata'}.` };

    } catch (error) {
        console.error("Errore gestione pausa preposto:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});