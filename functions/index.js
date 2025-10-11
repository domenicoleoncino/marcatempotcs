const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Funzione per creare un nuovo utente (admin, preposto o dipendente)
exports.createNewUser = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Method Not Allowed' });
    }
    try {
        const { email, password, nome, cognome, role, telefono } = req.body;
        if (!email || !password || !nome || !cognome || !role) {
            logger.error("Dati mancanti per la creazione utente", req.body);
            return res.status(400).send({ error: "Tutti i campi obbligatori (nome, cognome, email, password, ruolo) devono essere forniti." });
        }

        const displayName = `${nome} ${cognome}`;
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName,
        });

        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });

        if (role === 'employee') {
            await db.collection("employees").doc(userRecord.uid).set({
                name: nome,
                surname: cognome,
                email: email,
                userId: userRecord.uid,
                workAreaIds: []
            });
        } else {
            const userData = {
                nome: nome,
                cognome: cognome,
                email: email,
                role: role,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (telefono) userData.telefono = telefono;
            await db.collection("users").doc(userRecord.uid).set(userData);
        }

        logger.info(`Utente ${displayName} (UID: ${userRecord.uid}) creato con successo con ruolo ${role}.`);
        res.status(200).send({ success: true, message: `Utente ${displayName} creato con successo.`, uid: userRecord.uid });

    } catch (error) {
        logger.error("Errore durante la creazione dell'utente:", error);
        if (error.code === 'auth/email-already-exists') {
            res.status(409).send({ error: "L'indirizzo email è già in uso." });
        } else {
            res.status(500).send({ error: "Errore interno del server." });
        }
    }
});

// Funzione per impostare il ruolo a un dipendente esistente (manutenzione)
exports.setEmployeeRole = onCall(async (request) => {
    if (request.auth?.token?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eseguire questa operazione.');
    }
    const { targetUid } = request.data;
    if (!targetUid) {
        throw new HttpsError('invalid-argument', "L'UID del dipendente è obbligatorio.");
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { role: 'employee' });
        logger.info(`Ruolo 'employee' impostato per l'utente ${targetUid} da ${request.auth.uid}`);
        return { success: true, message: `Ruolo impostato correttamente per l'utente ${targetUid}.` };
    } catch (error) {
        logger.error(`Errore durante l'impostazione del ruolo per ${targetUid}:`, error);
        // MODIFICA: Invia il messaggio di errore specifico al client
        throw new HttpsError('internal', error.message || "Si è verificato un errore sconosciuto durante l'aggiornamento del ruolo.");
    }
});

// Funzione unificata per la timbratura di entrata
exports.clockEmployeeIn = onCall(async (request) => {
    const callingUid = request.auth.uid;
    const isManualEntry = request.data.targetEmployeeId && (request.auth?.token?.role === 'admin' || request.auth?.token?.role === 'preposto');
    
    const targetEmployeeId = isManualEntry ? request.data.targetEmployeeId : callingUid;
    const { areaId, note } = request.data;
    const timestamp = isManualEntry ? new Date(request.data.timestamp) : new Date();

    if (!areaId) {
        throw new HttpsError("invalid-argument", "L'ID dell'area di lavoro è obbligatorio.");
    }

    const startOfDay = new Date(timestamp);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(timestamp);
    endOfDay.setHours(23, 59, 59, 999);

    const existingEntryQuery = await db.collection("time_entries")
        .where("employeeId", "==", targetEmployeeId)
        .where("clockInTime", ">=", startOfDay)
        .where("clockInTime", "<=", endOfDay)
        .limit(1).get();

    if (!existingEntryQuery.empty) {
        throw new HttpsError("already-exists", `Il dipendente ha già una timbratura di entrata per oggi.`);
    }

    const employeeDoc = await db.collection("employees").doc(targetEmployeeId).get();
    if (!employeeDoc.exists) {
        throw new HttpsError("not-found", "Profilo dipendente non trovato.");
    }

    const newEntry = {
        employeeId: targetEmployeeId,
        employeeName: `${employeeDoc.data().name} ${employeeDoc.data().surname}`,
        workAreaId: areaId,
        clockInTime: timestamp,
        clockOutTime: null,
        status: "clocked-in",
        pauses: [],
        createdBy: callingUid,
        note: note || null
    };
    await db.collection("time_entries").add(newEntry);
    logger.info(`Timbratura IN per ${targetEmployeeId} da ${callingUid}`);
    return { success: true, message: "Timbratura di entrata registrata!" };
});

// Funzione per la timbratura di uscita
exports.clockEmployeeOut = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries").where("employeeId", "==", employeeId).where("status", "==", "clocked-in").limit(1).get();
    if (activeEntryQuery.empty) throw new HttpsError("not-found", "Nessuna timbratura attiva trovata.");

    await activeEntryQuery.docs[0].ref.update({
        status: "clocked-out",
        clockOutTime: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Timbratura OUT per ${employeeId}`);
    return { success: true, message: "Timbratura di uscita registrata!" };
});

// Funzione per la timbratura della pausa
exports.clockEmployeePause = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    const employeeId = request.auth.uid;

    const activeEntryQuery = await db.collection("time_entries").where("employeeId", "==", employeeId).where("status", "==", "clocked-in").limit(1).get();
    if (activeEntryQuery.empty) throw new HttpsError("not-found", "Nessuna timbratura attiva trovata per la pausa.");

    const entryDoc = activeEntryQuery.docs[0];
    const newPause = { startTime: admin.firestore.FieldValue.serverTimestamp() };
    await entryDoc.ref.update({
        pauses: admin.firestore.FieldValue.arrayUnion(newPause),
    });
    logger.info(`Pausa registrata per ${employeeId}`);
    return { success: true, message: "Pausa registrata con successo!" };
});

// Funzione per il reset dei dispositivi
exports.resetEmployeeDevice = onCall(async (request) => {
    if (request.auth?.token?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo un admin può eseguire questa operazione.');
    }
    const { employeeId } = request.data;
    if (!employeeId) {
        throw new HttpsError('invalid-argument', "L'ID del dipendente è obbligatorio.");
    }
    try {
        const employeeRef = db.collection('employees').doc(employeeId);
        await employeeRef.update({ deviceIds: [] });
        logger.info(`Dispositivi resettati per l'utente ${employeeId} da ${request.auth.uid}`);
        return { success: true, message: `Dispositivi resettati per l'utente ${employeeId}.` };
    } catch (error) {
        logger.error(`Errore durante il reset dei dispositivi per ${employeeId}:`, error);
        throw new HttpsError('internal', "Si è verificato un errore durante il reset dei dispositivi.");
    }
});

