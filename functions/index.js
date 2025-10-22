// File: functions/src/index.js

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
                workAreaIds: [], deviceIds: [],
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
// --- Funzioni Esistenti (Eliminazione, Aree, Timbrature Manuali, etc.) ---
// ===============================================
// (Assicurati che queste funzioni siano presenti nel tuo file)

exports.deleteUserAndEmployee = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.createWorkArea = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.manualClockIn = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.manualClockOut = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.prepostoTogglePause = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.prepostoAssignEmployeeToArea = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });
exports.TEMP_fixMyClaim = functions.region('europe-west1').https.onCall(async (data, context) => { /* ... logica ... */ });


// ===============================================
// --- NUOVA FUNZIONE: Applica Pausa Automatica (Dipendente/Preposto) ---
// ===============================================
exports.applyAutoPauseEmployee = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role; // Legge il ruolo dal token

    // Permetti solo a dipendenti e preposti loggati
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }

    const { durationMinutes } = data; // Riceve la durata dal frontend
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Durata della pausa non valida.');
    }

    try {
        // Trova il profilo employee dell'utente che chiama
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;

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
        if (error.code && error.code.startsWith('functions')) throw error; // Assicurati che il codice errore sia di tipo HttpsError
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

    try {
        // Trova il profilo employee dell'utente che chiama
        const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
        if (employeeQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
        }
        const employeeId = employeeQuery.docs[0].id;

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
// --- Funzioni Timbratura Dipendente (da EmployeeDashboard) ---
// ===============================================
// Queste sono le funzioni chiamate da EmployeeDashboard per clockIn e clockOut
// Assicurati che i nomi corrispondano a quelli usati in EmployeeDashboard

exports.clockEmployeeIn = functions.region('europe-west1').https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    const callerRole = context.auth?.token.role;
    if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) { // Permesso a dipendente e preposto
        throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
    }
     const { areaId } = data;
     if (!areaId) {
         throw new functions.https.HttpsError('invalid-argument', 'ID Area mancante.');
     }

     try {
         // Trova profilo employee
         const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
         if (employeeQuery.empty) {
             throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
         }
         const employeeId = employeeQuery.docs[0].id;

         // Controlla timbratura attiva
         const activeEntryQuery = await db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1).get();
         if (!activeEntryQuery.empty) {
             const activeEntryTime = activeEntryQuery.docs[0].data().clockInTime.toDate().toLocaleString('it-IT');
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
             createdBy: uid, // Registra chi ha effettivamente timbrato
             pauses: [],
             createdAt: FieldValue.serverTimestamp() // Timestamp creazione documento
         });
         return { success: true, message: "Timbratura di entrata registrata." };
     } catch (error) {
         console.error("Errore clockEmployeeIn:", error);
         if (error.code && error.code.startsWith('functions')) throw error;
         throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
     }
});

exports.clockEmployeeOut = functions.region('europe-west1').https.onCall(async (data, context) => {
     const uid = context.auth?.uid;
     const callerRole = context.auth?.token.role;
     if (!uid || (callerRole !== 'dipendente' && callerRole !== 'preposto')) {
         throw new functions.https.HttpsError('permission-denied', 'Azione non permessa.');
     }

     try {
         // Trova profilo employee
         const employeeQuery = await db.collection('employees').where('userId', '==', uid).limit(1).get();
         if (employeeQuery.empty) {
             throw new functions.https.HttpsError('not-found', 'Profilo dipendente non trovato.');
         }
         const employeeId = employeeQuery.docs[0].id;

         // Trova timbratura attiva
         const q = db.collection('time_entries').where('employeeId', '==', employeeId).where('status', '==', 'clocked-in').limit(1);
         const snapshot = await q.get();
         if (snapshot.empty) {
             throw new functions.https.HttpsError('not-found', 'Nessuna timbratura attiva trovata.');
         }
         const entryDoc = snapshot.docs[0];
         const entryData = entryDoc.data();

         // Controlla se in pausa
         const isInPause = (entryData.pauses || []).some(p => p.start && !p.end);
         if (isInPause) {
             throw new functions.https.HttpsError('failed-precondition', 'Terminare la pausa prima di timbrare l\'uscita.');
         }

         // Arrotonda e aggiorna timbratura
         const now = new Date();
         if (entryData.clockInTime.toDate() >= now) {
             throw new functions.https.HttpsError('invalid-argument', `L'uscita deve essere dopo l'entrata.`);
         }
         const roundedClockOutTime = roundTimeWithCustomRulesServer(now, 'uscita');
         await entryDoc.ref.update({
             clockOutTime: Timestamp.fromDate(roundedClockOutTime),
             status: 'clocked-out',
             lastModifiedBy: uid, // Registra chi ha chiuso la timbratura
             lastModifiedAt: FieldValue.serverTimestamp() // Timestamp ultima modifica
         });
         return { success: true, message: "Timbratura di uscita registrata." };
     } catch (error) {
         console.error("Errore clockEmployeeOut:", error);
         if (error.code && error.code.startsWith('functions')) throw error;
         throw new functions.https.HttpsError('internal', `Errore server: ${error.message}`);
     }
});